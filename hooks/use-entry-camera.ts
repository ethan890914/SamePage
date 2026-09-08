import { useCallback, useEffect, useRef, useState } from 'react';

export function useEntryCamera(enabled: boolean, onStopped: () => void) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const stoppedRef = useRef(onStopped);
  useEffect(() => {
    stoppedRef.current = onStopped;
  }, [onStopped]);
  useEffect(() => {
    const release = () => {
      generation.current += 1;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    return () => {
      release();
    };
  }, [enabled]);
  const enable = useCallback(async () => {
    const request = generation.current;
    setBusy(true);
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error('Camera access requires HTTPS or localhost.');
      const next = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      });
      if (request !== generation.current) {
        next.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = next;
      next.getVideoTracks()[0].onended = () => {
        setStream(null);
        setError('Your camera stopped. Enable it again to continue.');
        stoppedRef.current();
      };
      setStream(next);
    } catch {
      if (request === generation.current)
        setError(
          'Could not open your camera. Allow camera access and check that another app is not using it.',
        );
    } finally {
      setBusy(false);
    }
  }, []);
  return {
    stream:
      enabled && stream?.getVideoTracks()[0]?.readyState === 'live'
        ? stream
        : null,
    busy,
    error,
    enable,
  };
}
