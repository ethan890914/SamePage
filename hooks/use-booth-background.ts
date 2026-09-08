'use client';

import { useEffect, useRef, useState } from 'react';

type Result = {
  takeId: string | null;
  status: 'processing' | 'ready' | 'failed' | 'skipped';
  progress: number;
  photos: Record<string, string[]>;
};

export function useBoothBackground(
  takeId: string | null,
  originals: Record<string, string[]>,
) {
  const [result, setResult] = useState<Result>({
    takeId: null,
    status: 'processing',
    progress: 0,
    photos: {},
  });
  const [attempt, setAttempt] = useState(0);
  const stopRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!takeId) return;
    let stopped = false;
    let worker: Worker | null = null;
    let timeout: ReturnType<typeof setTimeout>;
    const urls: string[] = [];
    const stop = () => {
      stopped = true;
      worker?.terminate();
      clearTimeout(timeout);
    };
    stopRef.current = stop;
    const fail = () => {
      if (stopped) return;
      stop();
      setResult({ takeId, status: 'failed', progress: 0, photos: {} });
    };
    const timer = setTimeout(() => {
      if (stopped) return;
      setResult({ takeId, status: 'processing', progress: 0, photos: {} });
      try {
        const ids = Object.keys(originals).sort();
        if (
          ids.length !== 2 ||
          ids.some((id) => [0, 1, 2, 3].some((i) => !originals[id]?.[i]))
        ) {
          fail();
          return;
        }
        worker = new Worker('/booth-background-worker.js');
        timeout = setTimeout(fail, 90_000);
        worker.onerror = fail;
        worker.onmessageerror = fail;
        worker.onmessage = ({ data }) => {
          if (stopped) return;
          if (data.type === 'progress' && Number.isInteger(data.completed)) {
            setResult({
              takeId,
              status: 'processing',
              progress: data.completed,
              photos: {},
            });
          } else if (
            data.type === 'complete' &&
            Array.isArray(data.photos) &&
            data.photos.length === 8 &&
            data.photos.every(
              (photo: unknown) =>
                photo instanceof Blob && photo.type === 'image/png',
            )
          ) {
            for (const blob of data.photos)
              urls.push(URL.createObjectURL(blob));
            const photos = {
              [ids[0]]: urls.slice(0, 4),
              [ids[1]]: urls.slice(4, 8),
            };
            stop();
            setResult({ takeId, status: 'ready', progress: 8, photos });
          } else if (data.type === 'failed') fail();
        };
        worker.postMessage({
          type: 'process',
          photos: ids.flatMap((id) => originals[id].slice(0, 4)),
        });
      } catch {
        fail();
      }
    }, 0);
    return () => {
      clearTimeout(timer);
      stop();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [takeId, originals, attempt]);

  return {
    status: result.takeId === takeId ? result.status : 'processing',
    progress: result.takeId === takeId ? result.progress : 0,
    photos: result.takeId === takeId ? result.photos : {},
    skip: () => {
      stopRef.current();
      setResult({ takeId, status: 'skipped', progress: 0, photos: {} });
    },
    retry: () => {
      setResult({ takeId, status: 'processing', progress: 0, photos: {} });
      setAttempt((n) => n + 1);
    },
  };
}
