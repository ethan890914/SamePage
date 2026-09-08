'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Camera,
  Download,
  RotateCcw,
} from 'lucide-react';
import Image from 'next/image';
import { PixelButton } from '@/components/pixel/pixel-button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useBoothBackground } from '@/hooks/use-booth-background';
import {
  frameIds,
  shotTime,
  SHOT_INTERVAL,
  TAKE_DURATION_MS,
  type FrameId,
} from '@/lib/photo-booth';
import type { PlayerView } from '@/lib/protocol';
import {
  drawCamera,
  usePhotoBooth,
  type BoothConnection,
  type Crop,
} from '@/hooks/use-photo-booth';

const frames: Record<
  FrameId,
  { name: string; background: string; ink: string; accent: string }
> = {
  classic: {
    name: 'Classic',
    background: '#fffdf5',
    ink: '#25212d',
    accent: '#d5cec4',
  },
  midnight: {
    name: 'Midnight',
    background: '#1c2035',
    ink: '#ffffff',
    accent: '#7c91c8',
  },
  hearts: {
    name: 'Sweethearts',
    background: '#ffd4e1',
    ink: '#7c234b',
    accent: '#cf4271',
  },
  arcade: {
    name: 'Arcade',
    background: '#342650',
    ink: '#fff19b',
    accent: '#83eddd',
  },
};

function CameraPane({
  stream,
  crop,
  label,
  videoRef,
}: {
  stream: MediaStream | null;
  crop: Crop;
  label: string;
  videoRef?: RefObject<HTMLVideoElement | null>;
}) {
  const ownRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ref = videoRef ?? ownRef;
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      void ref.current.play().catch(() => undefined);
    }
  }, [stream, ref]);
  useEffect(() => {
    let request = 0;
    const draw = () => {
      const video = ref.current,
        ctx = canvasRef.current?.getContext('2d');
      if (video && ctx && video.readyState >= 2 && video.videoWidth)
        drawCamera(ctx, video, crop);
      request = requestAnimationFrame(draw);
    };
    request = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(request);
  }, [ref, crop]);
  return (
    <div className="booth-camera">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        className="booth-source-video"
      />
      <canvas ref={canvasRef} width={600} height={600} aria-label={label} />
      {!stream && (
        <div className="booth-camera-empty">
          <Camera size={32} />
          <span>Waiting for camera</span>
        </div>
      )}
      <span className="booth-name">{label}</span>
    </div>
  );
}

async function renderStrip(
  canvas: HTMLCanvasElement,
  frame: FrameId,
  left: string[],
  right: string[],
  sharedBackground = false,
) {
  canvas.width = 1280;
  canvas.height = 2850;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create your strip.');
  const theme = frames[frame];
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, 1280, 2850);
  ctx.fillStyle = theme.ink;
  ctx.textAlign = 'center';
  ctx.font = 'bold 44px monospace';
  ctx.fillText('SAME PAGE', 640, 86);
  for (let i = 0; i < 4; i++) {
    const y = 130 + i * 640;
    ctx.fillStyle = theme.accent;
    ctx.fillRect(32, y - 8, 1216, 616);
    if (sharedBackground) {
      const studio = ctx.createLinearGradient(40, y, 1240, y + 600);
      studio.addColorStop(0, '#e5effa');
      studio.addColorStop(1, '#b5cde8');
      ctx.fillStyle = studio;
      ctx.fillRect(40, y, 1200, 600);
    }
    for (let side = 0; side < 2; side++) {
      const image = new window.Image();
      image.src = (side === 0 ? left : right)[i];
      await image.decode();
      ctx.drawImage(image, 40 + side * 600, y, 600, 600);
    }
    if (frame === 'hearts') {
      ctx.fillStyle = theme.accent;
      ctx.font = '32px sans-serif';
      ctx.fillText('♥', 640, y + 635);
    }
    if (frame === 'arcade') {
      ctx.fillStyle = theme.ink;
      for (let x = 48; x < 1240; x += 48) ctx.fillRect(x, y + 617, 16, 12);
    }
  }
  ctx.fillStyle = theme.ink;
  ctx.font = '30px monospace';
  ctx.fillText('YOU + ME  /  FOUR LITTLE MOMENTS', 640, 2770);
}

export function PhotoBooth(
  props: BoothConnection & { players: PlayerView[]; onExit: () => void },
) {
  const booth = usePhotoBooth(props);
  const stripRef = useRef<HTMLCanvasElement | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [renderedKey, setRenderedKey] = useState('');
  const [remotePlaying, setRemotePlaying] = useState(false);
  const [backgroundChoice, setBackgroundChoice] = useState<{
    takeId: string | null;
    original: boolean;
  }>({ takeId: null, original: false });
  const { state } = booth;
  const frame = state?.frame ?? 'classic';
  const leftId = state?.leftId ?? props.selfId;
  const rightId = leftId === props.selfId ? props.peerId : props.selfId;
  const complete = [props.selfId, props.peerId].every((id) =>
    [0, 1, 2, 3].every((i) => Boolean(booth.photos[id]?.[i])),
  );
  const background = useBoothBackground(
    complete ? (state?.takeId ?? null) : null,
    booth.photos,
  );
  const usingShared =
    background.status === 'ready' &&
    !(backgroundChoice.takeId === state?.takeId && backgroundChoice.original);
  const stripPhotos = usingShared ? background.photos : booth.photos;
  const capturing =
    state?.startsAt != null && booth.clock < state.startsAt + TAKE_DURATION_MS;
  const shotIndex =
    state?.startsAt != null
      ? Math.min(
          3,
          Math.max(
            0,
            Math.floor((booth.clock - state.startsAt) / SHOT_INTERVAL),
          ),
        )
      : 0;
  const remaining =
    state?.startsAt != null
      ? Math.min(
          10,
          Math.max(
            0,
            Math.ceil(
              (shotTime(state.startsAt, shotIndex) - booth.clock) / 1000,
            ),
          ),
        )
      : 10;
  const ready = state?.readyIds.includes(props.selfId) ?? false;
  const bothReady = state?.readyIds.length === 2;
  const startRemaining =
    state?.autoStartAt != null
      ? Math.min(
          3,
          Math.max(1, Math.ceil((state.autoStartAt - booth.clock) / 1000)),
        )
      : null;
  const canReady =
    booth.connected && Boolean(booth.localStream) && remotePlaying;
  const locked = Boolean(state?.takeId);
  const renderKey = `${state?.takeId}:${frame}:${usingShared ? 'shared' : 'original'}`;

  useEffect(() => {
    const track = booth.remoteStream?.getVideoTracks()[0];
    const timer = window.setTimeout(
      () =>
        setRemotePlaying(
          Boolean(track && !track.muted && track.readyState === 'live'),
        ),
      0,
    );
    if (!track) return () => clearTimeout(timer);
    const update = () =>
      setRemotePlaying(!track.muted && track.readyState === 'live');
    track.addEventListener('unmute', update);
    track.addEventListener('mute', update);
    track.addEventListener('ended', update);
    return () => {
      clearTimeout(timer);
      track.removeEventListener('unmute', update);
      track.removeEventListener('mute', update);
      track.removeEventListener('ended', update);
    };
  }, [booth.remoteStream]);

  useEffect(() => {
    if (!complete || !stripRef.current) return;
    let cancelled = false;
    // Render offscreen so a superseded frame cannot overwrite the latest one.
    const canvas = document.createElement('canvas');
    void renderStrip(
      canvas,
      frame,
      stripPhotos[leftId],
      stripPhotos[rightId],
      usingShared,
    )
      .then(() => {
        if (cancelled || !stripRef.current) return;
        stripRef.current.width = canvas.width;
        stripRef.current.height = canvas.height;
        stripRef.current.getContext('2d')?.drawImage(canvas, 0, 0);
        setRenderedKey(renderKey);
        setExportError(null);
      })
      .catch(() => {
        if (!cancelled)
          setExportError(
            'Could not assemble your strip. Retake the photos and try again.',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [complete, frame, stripPhotos, leftId, rightId, renderKey, usingShared]);

  const download = () => {
    stripRef.current?.toBlob((blob) => {
      if (!blob) {
        setExportError('Could not download your strip. Please try again.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `same-page-${state?.takeId?.slice(0, 8) ?? 'photo-strip'}-${usingShared ? 'shared-background' : 'original'}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }, 'image/png');
  };
  const pane = (id: string) => (
    <CameraPane
      key={id}
      stream={id === props.selfId ? booth.localStream : booth.remoteStream}
      crop={id === props.selfId ? booth.crop : booth.remoteCrop}
      label={`${props.players.find((p) => p.id === id)?.name ?? 'Your person'}${id === props.selfId ? ' · you' : ''}`}
      videoRef={id === props.selfId ? booth.videoRef : undefined}
    />
  );

  return (
    <section className="booth-shell" aria-labelledby="booth-title">
      <header className="booth-header">
        <div>
          <p className="pixel-kicker">A little time together</p>
          <h1 id="booth-title">Photo Booth</h1>
        </div>
        <PixelButton onClick={props.onExit}>
          <ArrowLeft size={17} /> Back to lobby
        </PixelButton>
      </header>
      <div className="booth-layout">
        <div className="booth-workspace">
          <div className="booth-viewfinder">
            <div
              className={`booth-camera-pair ${capturing && remaining === 0 ? 'booth-flash' : ''}`}
            >
              {pane(leftId)}
              {pane(rightId)}
            </div>
            {capturing && (
              <div
                className="booth-countdown"
                role="timer"
                aria-label={`${remaining} seconds until photo ${shotIndex + 1}`}
              >
                {remaining || '✦'}
              </div>
            )}
            <div className="booth-viewfinder-footer">
              <span>
                {complete
                  ? 'Four little moments, together.'
                  : capturing
                    ? `Photo ${shotIndex + 1} of 4 · strike a pose`
                    : 'Find your spot. Make it yours.'}
              </span>
              <span
                className={`booth-live ${booth.connected ? 'is-connected' : ''}`}
              >
                {booth.connected ? 'Connected' : 'Connecting'}
              </span>
            </div>
          </div>
          {(booth.error || exportError) && (
            <p className="lobby-error" role="alert">
              {booth.error ?? exportError}
            </p>
          )}
          <div className="booth-main-actions">
            {!booth.localStream && (
              <PixelButton
                variant="primary"
                onClick={() => {
                  void booth.enableCamera();
                }}
                disabled={booth.enabling}
              >
                {booth.enabling ? 'Opening camera…' : 'Enable my camera'}
                <Camera size={17} />
              </PixelButton>
            )}
            <PixelButton
              onClick={() => booth.command({ kind: 'swap' })}
              disabled={locked || !state}
            >
              <ArrowLeftRight size={17} /> Switch sides
            </PixelButton>
            {!locked && (
              <PixelButton
                onClick={() => booth.command({ kind: 'ready', ready: !ready })}
                disabled={!canReady}
                variant={ready ? 'secondary' : 'primary'}
              >
                {ready ? 'Cancel ready' : 'I’m ready'}
              </PixelButton>
            )}
            {!locked && (
              <PixelButton
                onClick={() => booth.command({ kind: 'start' })}
                disabled={!bothReady || !canReady}
                variant="primary"
              >
                {bothReady && startRemaining !== null
                  ? `Start session in ${startRemaining}`
                  : 'Start session'}
              </PixelButton>
            )}
            {locked && (
              <PixelButton onClick={() => booth.command({ kind: 'reset' })}>
                <RotateCcw size={17} />
                {capturing ? 'Cancel session' : 'Retake all four'}
              </PixelButton>
            )}
            {(!booth.connected || booth.error) && (
              <PixelButton onClick={booth.reconnect}>
                Reconnect cameras
              </PixelButton>
            )}
          </div>
          <p className="booth-help" aria-live="polite">
            {capturing
              ? '10 seconds before every photo. Keep this tab open.'
              : complete
                ? 'Choose a frame and save your strip.'
                : locked
                  ? 'Receiving your photos… Keep both booths open.'
                  : !canReady
                    ? 'Enable both cameras before getting ready.'
                    : ready
                      ? 'Ready when your person is. Four photos, 10 seconds to pose for each.'
                      : 'Choose your sides and framing, then both tap “I’m ready”.'}
          </p>
          <fieldset
            className="booth-adjustments"
            disabled={locked || !booth.localStream}
          >
            <legend>Your camera framing</legend>
            {(['zoom', 'x', 'y'] as const).map((key) => (
              <label key={key}>
                <span>
                  {key === 'zoom'
                    ? 'Zoom'
                    : key === 'x'
                      ? 'Horizontal position'
                      : 'Vertical position'}
                </span>
                <Slider
                  aria-label={
                    key === 'zoom'
                      ? 'Zoom'
                      : key === 'x'
                        ? 'Horizontal position'
                        : 'Vertical position'
                  }
                  value={[booth.crop[key]]}
                  min={key === 'zoom' ? 1 : 0}
                  max={key === 'zoom' ? 2 : 100}
                  step={key === 'zoom' ? 0.05 : 1}
                  disabled={locked || !booth.localStream}
                  onValueChange={(value) =>
                    booth.updateCrop({
                      ...booth.crop,
                      [key]: Array.isArray(value) ? value[0] : value,
                    })
                  }
                />
              </label>
            ))}
            <label className="booth-mirror" htmlFor="booth-mirror">
              <span>Mirror my camera</span>
              <Switch
                id="booth-mirror"
                checked={booth.crop.mirror}
                disabled={locked || !booth.localStream}
                onCheckedChange={(mirror) =>
                  booth.updateCrop({ ...booth.crop, mirror })
                }
              />
            </label>
          </fieldset>
        </div>
        <aside className="booth-strip-panel" aria-label="Your photo strip">
          <h2>Make it a keepsake</h2>
          {complete && (
            <div className="booth-background-step">
              <output>
                {background.status === 'processing'
                  ? `Preparing shared background… ${background.progress}/8 portraits`
                  : background.status === 'ready'
                    ? 'Your shared background is ready.'
                    : background.status === 'failed'
                      ? 'We couldn’t finish the background effect. Your original strip is ready to save.'
                      : 'Keeping your original photos.'}
              </output>
              {background.status === 'processing' ? (
                <PixelButton
                  onClick={() => {
                    setBackgroundChoice({
                      takeId: state?.takeId ?? null,
                      original: true,
                    });
                    background.skip();
                  }}
                >
                  Keep original
                </PixelButton>
              ) : background.status === 'ready' ? (
                <label
                  className="booth-background-toggle"
                  htmlFor="booth-shared-background"
                >
                  <span>Shared background</span>
                  <Switch
                    id="booth-shared-background"
                    checked={usingShared}
                    onCheckedChange={(shared) =>
                      setBackgroundChoice({
                        takeId: state?.takeId ?? null,
                        original: !shared,
                      })
                    }
                  />
                </label>
              ) : (
                <PixelButton
                  onClick={() => {
                    setBackgroundChoice({
                      takeId: state?.takeId ?? null,
                      original: false,
                    });
                    background.retry();
                  }}
                >
                  {background.status === 'failed'
                    ? 'Try again'
                    : 'Try shared background'}
                </PixelButton>
              )}
              <small>
                {usingShared
                  ? 'Switch off to see or download the original.'
                  : 'The original strip is available to download.'}
              </small>
            </div>
          )}
          <div className="booth-frame-picker" aria-label="Choose a frame">
            {frameIds.map((id) => (
              <button
                key={id}
                type="button"
                disabled={capturing || !state}
                aria-pressed={frame === id}
                onClick={() => booth.command({ kind: 'frame', frame: id })}
                style={{
                  backgroundColor: frames[id].background,
                  color: frames[id].ink,
                }}
              >
                {frames[id].name}
              </button>
            ))}
          </div>
          {complete ? (
            <canvas
              className="booth-finished-strip"
              ref={stripRef}
              aria-label={`Your completed strip with ${usingShared ? 'a shared background' : 'the original backgrounds'}`}
            />
          ) : (
            <div
              className="booth-strip-preview"
              style={{
                backgroundColor: frames[frame].background,
                color: frames[frame].ink,
              }}
            >
              <strong>SAME PAGE</strong>
              {[0, 1, 2, 3].map((i) => (
                <div className="booth-strip-slot" key={i}>
                  {[leftId, rightId].map((id) =>
                    booth.photos[id]?.[i] ? (
                      <Image
                        unoptimized
                        width={600}
                        height={600}
                        key={id}
                        src={booth.photos[id][i]}
                        alt={`Pose ${i + 1}, ${id === leftId ? 'left' : 'right'} person`}
                      />
                    ) : (
                      <span key={id}>{i + 1}</span>
                    ),
                  )}
                </div>
              ))}
              <small>YOU + ME</small>
            </div>
          )}
          <PixelButton
            variant="primary"
            onClick={download}
            disabled={!complete || renderedKey !== renderKey}
          >
            <Download size={17} />{' '}
            {complete
              ? usingShared
                ? 'Download shared strip'
                : 'Download original'
              : 'Download strip'}
          </PixelButton>
          <p className="booth-help">
            Photos stay in this session until you download them. Leaving or
            refreshing clears your copy.
          </p>
        </aside>
      </div>
    </section>
  );
}
