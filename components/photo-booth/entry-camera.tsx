import { useLanguage } from '@/lib/i18n/provider';
import { useEffect, useRef } from 'react';

export function EntryCamera({
  stream,
  error,
}: {
  stream: MediaStream | null;
  error: string | null;
}) {
  const { t } = useLanguage();
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="entry-camera">
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        aria-label={t('Your camera preview')}
      />
      <p>
        {stream
          ? t('Your camera will stay on when you enter the booth.')
          : t('Enable your camera before getting ready.')}
      </p>
      {error && <p role="alert">{t(error)}</p>}
    </div>
  );
}
