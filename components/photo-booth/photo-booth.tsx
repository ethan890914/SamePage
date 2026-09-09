'use client';
import { useLanguage } from '@/lib/i18n/provider';

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
  takeDuration,
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
  const { t } = useLanguage();
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
          <span>{t('Waiting for camera')}</span>
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
  const { t } = useLanguage();
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
  const countdownSeconds = state?.countdownSeconds ?? 10;
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
    state?.startsAt != null &&
    booth.clock < state.startsAt + takeDuration(countdownSeconds);
  const shotIndex =
    state?.startsAt != null
      ? Math.min(
          3,
          Math.max(
            0,
            Math.floor(
              (booth.clock - state.startsAt) / (countdownSeconds * 1000 + 1000),
            ),
          ),
        )
      : 0;
  const remaining =
    state?.startsAt != null
      ? Math.min(
          countdownSeconds,
          Math.max(
            0,
            Math.ceil(
              (shotTime(state.startsAt, shotIndex, countdownSeconds) -
                booth.clock) /
                1000,
            ),
          ),
        )
      : countdownSeconds;
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
      label={`${props.players.find((p) => p.id === id)?.name ?? t('Your person')}${id === props.selfId ? t(' · you') : ''}`}
      videoRef={id === props.selfId ? booth.videoRef : undefined}
    />
  );

  return (
    <section className="booth-shell" aria-labelledby="booth-title">
      <header className="booth-header">
        <div>
          <p className="pixel-kicker">{t('A little time together')}</p>
          <h1 id="booth-title">{t('Photo Booth')}</h1>
        </div>
        <PixelButton onClick={props.onExit}>
          <ArrowLeft size={17} />
          {t('Back to lobby')}
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
                aria-label={t('{0} seconds until photo {1}', [
                  remaining,
                  shotIndex + 1,
                ])}
              >
                {remaining || '✦'}
              </div>
            )}
            <div className="booth-viewfinder-footer">
              <span>
                {complete
                  ? t('Four little moments, together.')
                  : capturing
                    ? t('Photo {0} of 4 · strike a pose', [shotIndex + 1])
                    : t('Find your spot. Make it yours.')}
              </span>
              <span
                className={`booth-live ${booth.connected ? 'is-connected' : ''}`}
              >
                {booth.connected ? t('Connected') : t('Connecting')}
              </span>
            </div>
          </div>
          {(booth.error || exportError) && (
            <p className="lobby-error" role="alert">
              {t(booth.error ?? exportError ?? '')}
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
                {booth.enabling ? t('Opening camera…') : t('Enable my camera')}
                <Camera size={17} />
              </PixelButton>
            )}
            <PixelButton
              onClick={() => booth.command({ kind: 'swap' })}
              disabled={locked || !state}
            >
              <ArrowLeftRight size={17} />
              {t('Switch sides')}
            </PixelButton>
            {!locked && (
              <PixelButton
                onClick={() => booth.command({ kind: 'ready', ready: !ready })}
                disabled={!canReady}
                variant={ready ? 'secondary' : 'primary'}
              >
                {ready ? t('Cancel ready') : t('I’m ready')}
              </PixelButton>
            )}
            {!locked && (
              <PixelButton
                onClick={() => booth.command({ kind: 'start' })}
                disabled={!bothReady || !canReady}
                variant="primary"
              >
                {bothReady && startRemaining !== null
                  ? t('Start session in {0}', [startRemaining])
                  : t('Start session')}
              </PixelButton>
            )}
            {locked && (
              <PixelButton onClick={() => booth.command({ kind: 'reset' })}>
                <RotateCcw size={17} />
                {capturing ? t('Cancel session') : t('Retake all four')}
              </PixelButton>
            )}
            {(!booth.connected || booth.error) && (
              <PixelButton onClick={booth.reconnect}>
                {t('Reconnect cameras')}
              </PixelButton>
            )}
          </div>
          <p className="booth-help" aria-live="polite">
            {capturing
              ? t('{0} seconds before every photo. Keep this tab open.', [
                  countdownSeconds,
                ])
              : complete
                ? t('Choose a frame and save your strip.')
                : locked
                  ? t('Receiving your photos… Keep both booths open.')
                  : !canReady
                    ? t('Enable both cameras before getting ready.')
                    : ready
                      ? t(
                          'Ready when your person is. Four photos, {0} seconds to pose for each.',
                          [countdownSeconds],
                        )
                      : t(
                          'Choose your sides and framing, then both tap “I’m ready”.',
                        )}
          </p>
          <fieldset
            className="booth-adjustments"
            disabled={locked || !booth.localStream}
          >
            <legend>{t('Your camera framing')}</legend>
            {(['zoom', 'x', 'y'] as const).map((key) => (
              <label key={key}>
                <span>
                  {key === 'zoom'
                    ? t('Zoom')
                    : key === 'x'
                      ? t('Horizontal position')
                      : t('Vertical position')}
                </span>
                <Slider
                  aria-label={
                    key === 'zoom'
                      ? t('Zoom')
                      : key === 'x'
                        ? t('Horizontal position')
                        : t('Vertical position')
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
              <span>{t('Mirror my camera')}</span>
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
        <aside className="booth-strip-panel" aria-label={t('Your photo strip')}>
          <h2>{t('Make it a keepsake')}</h2>
          {complete && (
            <div className="booth-background-step">
              <output>
                {background.status === 'processing'
                  ? t('Preparing shared background… {0}/8 portraits', [
                      background.progress,
                    ])
                  : background.status === 'ready'
                    ? t('Your shared background is ready.')
                    : background.status === 'failed'
                      ? t(
                          'We couldn’t finish the background effect. Your original strip is ready to save.',
                        )
                      : t('Keeping your original photos.')}
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
                  {t('Keep original')}
                </PixelButton>
              ) : background.status === 'ready' ? (
                <label
                  className="booth-background-toggle"
                  htmlFor="booth-shared-background"
                >
                  <span>{t('Shared background')}</span>
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
                    ? t('Try again')
                    : t('Try shared background')}
                </PixelButton>
              )}
              <small>
                {usingShared
                  ? t('Switch off to see or download the original.')
                  : t('The original strip is available to download.')}
              </small>
            </div>
          )}
          <div className="booth-frame-picker" aria-label={t('Choose a frame')}>
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
                {t(frames[id].name)}
              </button>
            ))}
          </div>
          {complete ? (
            <canvas
              className="booth-finished-strip"
              ref={stripRef}
              aria-label={t('Your completed strip with {0}', [
                usingShared
                  ? t('a shared background')
                  : t('the original backgrounds'),
              ])}
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
                        alt={t('Pose {0}, {1} person', [
                          i + 1,
                          id === leftId ? 'left' : 'right',
                        ])}
                      />
                    ) : (
                      <span key={id}>{i + 1}</span>
                    ),
                  )}
                </div>
              ))}
              <small>{t('YOU + ME')}</small>
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
                ? t('Download shared strip')
                : t('Download original')
              : t('Download strip')}
          </PixelButton>
          <p className="booth-help">
            {t(
              'Photos stay in this session until you download them. Leaving or refreshing clears your copy.',
            )}
          </p>
        </aside>
      </div>
    </section>
  );
}
