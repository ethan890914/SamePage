'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ServerMessage } from '@/lib/protocol';
import { BoothCamera, captureBoothFrame } from '@/lib/booth-camera';
import {
  shotTime,
  type BoothCommand,
  type BoothState,
} from '@/lib/photo-booth';

export type Crop = { zoom: number; x: number; y: number; mirror: boolean };
export const defaultCrop: Crop = { zoom: 1, x: 50, y: 50, mirror: true };
export type BoothConnection = {
  selfId: string;
  peerId: string;
  instanceId: string;
  send: (instanceId: string, command: BoothCommand) => void;
  subscribe: (listener: (message: ServerMessage) => void) => () => void;
};

export function drawCamera(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  crop: Crop,
) {
  const width = ctx.canvas.width,
    height = ctx.canvas.height;
  const scale =
    Math.max(width / video.videoWidth, height / video.videoHeight) * crop.zoom;
  const w = video.videoWidth * scale,
    h = video.videoHeight * scale;
  ctx.save();
  if (crop.mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(
    video,
    ((width - w) * crop.x) / 100,
    ((height - h) * crop.y) / 100,
    w,
    h,
  );
  ctx.restore();
}

async function sendPhoto(
  channel: RTCDataChannel,
  url: string,
  takeId: string,
  index: number,
  cancelled: () => boolean,
) {
  for (let start = 0; start < url.length; start += 12_000) {
    const deadline = Date.now() + 15_000;
    while (channel.bufferedAmount > 128_000) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      if (cancelled()) return;
      if (channel.readyState !== 'open' || Date.now() > deadline)
        throw new Error(
          'Photo transfer interrupted. Reconnect and retake your photos.',
        );
    }
    if (cancelled()) return;
    channel.send(
      JSON.stringify({
        kind: 'photo',
        takeId,
        index,
        sequence: start / 12_000,
        part: url.slice(start, start + 12_000),
        last: start + 12_000 >= url.length,
      }),
    );
  }
}

export function usePhotoBooth({
  selfId,
  peerId,
  instanceId,
  send,
  subscribe,
}: BoothConnection) {
  const [state, setState] = useState<BoothState | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connected, setConnected] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>(defaultCrop);
  const [remoteCrop, setRemoteCrop] = useState<Crop>(defaultCrop);
  const [photos, setPhotos] = useState<Record<string, string[]>>({});
  const [clock, setClock] = useState(() => Date.now());
  const [retry, setRetry] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stateRef = useRef(state);
  const cropRef = useRef(crop);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRef = useRef<BoothCamera | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const offsetRef = useRef(0);
  const receivedShotsRef = useRef(new Set<number>());
  const aliveRef = useRef(true);

  const command = useCallback(
    (value: BoothCommand) => send(instanceId, value),
    [send, instanceId],
  );

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let pc: RTCPeerConnection | null = null;
    let camera: BoothCamera | null = null;
    let receivedHello = false;
    let pending: Extract<ServerMessage, { type: 'booth_signal' }>[] = [];
    const candidates: RTCIceCandidateInit[] = [];
    const chunks = new Map<
      string,
      { parts: string[]; next: number; size: number }
    >();
    let serial = Promise.resolve();
    const signal = (
      type: 'offer' | 'answer' | 'candidate' | 'hello' | 'restart',
      value: string,
    ) => command({ kind: 'signal', targetId: peerId, signal: { type, value } });
    const fail = () => {
      if (disposed) return;
      setConnected(false);
      setError('Camera connection interrupted. Reconnect cameras to continue.');
      command({ kind: 'reset' });
    };
    const attachChannel = (channel: RTCDataChannel) => {
      channelRef.current = channel;
      channel.onopen = () => {
        if (disposed) return;
        setConnected(true);
        setError(null);
        channel.send(JSON.stringify({ kind: 'crop', ...cropRef.current }));
      };
      channel.onclose = fail;
      channel.onerror = fail;
      channel.onmessage = (event) => {
        if (typeof event.data !== 'string' || event.data.length > 16_000)
          return;
        try {
          const data = JSON.parse(event.data);
          if (
            data.kind === 'crop' &&
            typeof data.mirror === 'boolean' &&
            Number.isFinite(data.zoom) &&
            data.zoom >= 1 &&
            data.zoom <= 2 &&
            Number.isFinite(data.x) &&
            data.x >= 0 &&
            data.x <= 100 &&
            Number.isFinite(data.y) &&
            data.y >= 0 &&
            data.y <= 100
          ) {
            setRemoteCrop({
              zoom: data.zoom,
              x: data.x,
              y: data.y,
              mirror: data.mirror,
            });
          }
          if (
            data.kind !== 'photo' ||
            data.takeId !== stateRef.current?.takeId ||
            !Number.isInteger(data.index) ||
            data.index < 0 ||
            data.index > 3 ||
            typeof data.part !== 'string' ||
            typeof data.last !== 'boolean' ||
            !Number.isInteger(data.sequence)
          )
            return;
          const key = `${data.takeId}:${data.index}`;
          const item = chunks.get(key) ?? { parts: [], next: 0, size: 0 };
          if (
            data.sequence !== item.next ||
            item.size + data.part.length > 1_000_000
          ) {
            chunks.delete(key);
            return;
          }
          item.parts.push(data.part);
          item.next++;
          item.size += data.part.length;
          chunks.set(key, item);
          if (data.last) {
            const url = item.parts.join('');
            chunks.delete(key);
            if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(url)) return;
            receivedShotsRef.current.add(data.index);
            setPhotos((current) => {
              const next = [...(current[peerId] ?? [])];
              next[data.index] = url;
              return { ...current, [peerId]: next };
            });
          }
        } catch {
          /* Ignore malformed peer messages. */
        }
      };
    };
    const acceptSignal = async (
      message: Extract<ServerMessage, { type: 'booth_signal' }>,
    ) => {
      if (!pc || disposed) {
        pending.push(message);
        return;
      }
      const { type, value } = message.signal;
      if (type === 'restart') {
        setConnected(false);
        setRemoteStream(null);
        setRetry((n) => n + 1);
        return;
      }
      if (type === 'hello') {
        if (receivedHello) return;
        receivedHello = true;
        signal('hello', '');
        if (selfId < peerId) {
          await camera!.prepareOffer();
          await pc.setLocalDescription(await pc.createOffer());
          signal('offer', pc.localDescription!.sdp);
        }
      } else if (type === 'candidate') {
        const candidate = JSON.parse(value) as RTCIceCandidateInit;
        if (pc.remoteDescription) await pc.addIceCandidate(candidate);
        else candidates.push(candidate);
      } else {
        await pc.setRemoteDescription({ type, sdp: value });
        for (const candidate of candidates.splice(0))
          await pc.addIceCandidate(candidate);
        if (type === 'offer') {
          await camera!.prepareAnswer();
          await pc.setLocalDescription(await pc.createAnswer());
          signal('answer', pc.localDescription!.sdp);
        }
      }
    };
    const unsubscribe = subscribe((message) => {
      if (disposed) return;
      if (
        message.type === 'booth_state' &&
        message.state.instanceId === instanceId
      ) {
        offsetRef.current = message.serverTime - Date.now();
        if (stateRef.current?.takeId !== message.state.takeId) {
          setPhotos({});
          chunks.clear();
          receivedShotsRef.current.clear();
        }
        stateRef.current = message.state;
        setState(message.state);
      }
      if (message.type === 'booth_ice') {
        if (typeof RTCPeerConnection === 'undefined') {
          setError(
            'This browser does not support shared cameras. Open the booth in a current browser.',
          );
          return;
        }
        pc?.close();
        pc = new RTCPeerConnection({ iceServers: message.iceServers });
        camera = new BoothCamera(pc);
        cameraRef.current = camera;
        const track = streamRef.current?.getVideoTracks()[0];
        if (track) void camera.setTrack(track).catch(fail);
        pc.onicecandidate = (event) => {
          if (event.candidate)
            signal('candidate', JSON.stringify(event.candidate.toJSON()));
        };
        pc.ontrack = (event) => {
          if (!disposed) setRemoteStream(new MediaStream([event.track]));
        };
        pc.onconnectionstatechange = () => {
          if (
            pc?.connectionState === 'failed' ||
            pc?.connectionState === 'disconnected'
          )
            fail();
        };
        pc.ondatachannel = (event) => attachChannel(event.channel);
        if (selfId < peerId) {
          attachChannel(pc.createDataChannel('booth'));
        }
        signal('hello', '');
        for (const queued of pending)
          serial = serial.then(() => acceptSignal(queued)).catch(fail);
        pending = [];
      }
      if (
        message.type === 'booth_signal' &&
        message.instanceId === instanceId &&
        message.fromId === peerId
      )
        serial = serial.then(() => acceptSignal(message)).catch(fail);
    });
    command({ kind: 'sync' });
    const timer = window.setInterval(
      () => setClock(Date.now() + offsetRef.current),
      100,
    );
    const connectionTimeout = window.setTimeout(() => {
      if (channelRef.current?.readyState !== 'open') fail();
    }, 25_000);
    return () => {
      disposed = true;
      unsubscribe();
      clearInterval(timer);
      clearTimeout(connectionTimeout);
      pc?.close();
      cameraRef.current = null;
      channelRef.current = null;
    };
  }, [command, instanceId, peerId, selfId, subscribe, retry]);

  const enableCamera = useCallback(async () => {
    setEnabling(true);
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          'Camera access requires HTTPS or localhost and a supported browser.',
        );
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      });
      if (!aliveRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      setLocalStream(stream);
      await cameraRef.current?.setTrack(stream.getVideoTracks()[0]);
      stream.getVideoTracks()[0].onended = () => {
        if (!aliveRef.current) return;
        setLocalStream(null);
        setError('Your camera stopped. Enable it again to continue.');
        command({ kind: 'reset' });
      };
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser, then try again.'
          : cause instanceof Error && cause.name === 'NotReadableError'
            ? 'Your camera is busy. Release it in the other app, then try again.'
            : cause instanceof Error
              ? cause.message
              : 'Could not open your camera.',
      );
    } finally {
      if (aliveRef.current) setEnabling(false);
    }
  }, [command]);

  const updateCrop = (next: Crop) => {
    cropRef.current = next;
    setCrop(next);
    if (channelRef.current?.readyState === 'open')
      channelRef.current.send(JSON.stringify({ kind: 'crop', ...next }));
    command({ kind: 'ready', ready: false });
  };

  useEffect(() => {
    if (!state?.takeId || state.startsAt === null) return;
    const takeId = state.takeId;
    const startsAt = state.startsAt;
    let cancelled = false;
    const timers: number[] = [];
    const capture = async (index: number) => {
      if (cancelled || stateRef.current?.takeId !== takeId) return;
      try {
        const video = videoRef.current;
        const channel = channelRef.current;
        const url = captureBoothFrame(
          video,
          streamRef.current,
          channel,
          Date.now() + offsetRef.current - shotTime(startsAt, index),
          (ctx, source) => drawCamera(ctx, source, cropRef.current),
        );
        setPhotos((current) => {
          const next = [...(current[selfId] ?? [])];
          next[index] = url;
          return { ...current, [selfId]: next };
        });
        await sendPhoto(channel!, url, takeId, index, () => cancelled);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Photo capture failed. Please retake.',
        );
        command({ kind: 'reset' });
      }
    };
    for (let i = 0; i < 4; i++) {
      const delay =
        shotTime(state.startsAt, i) - (Date.now() + offsetRef.current);
      if (delay >= 0)
        timers.push(
          window.setTimeout(() => {
            void capture(i);
          }, delay),
        );
    }
    const deadline =
      shotTime(startsAt, 3) + 20_000 - (Date.now() + offsetRef.current);
    timers.push(
      window.setTimeout(
        () => {
          if (receivedShotsRef.current.size < 4) {
            setError(
              'Some photos did not arrive. Reconnect cameras and retake the strip.',
            );
            command({ kind: 'reset' });
          }
        },
        Math.max(0, deadline),
      ),
    );
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [state?.takeId, state?.startsAt, command, selfId]);

  return {
    state,
    localStream,
    remoteStream,
    connected,
    enabling,
    error,
    crop,
    remoteCrop,
    photos,
    clock,
    videoRef,
    command,
    enableCamera,
    updateCrop,
    reconnect: () => {
      setConnected(false);
      setRemoteStream(null);
      setPhotos({});
      command({ kind: 'reset' });
      command({
        kind: 'signal',
        targetId: peerId,
        signal: { type: 'restart', value: '' },
      });
      setRetry((n) => n + 1);
    },
  };
}
