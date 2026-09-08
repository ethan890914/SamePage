import { useEffect, useRef } from 'react';

export function EntryCamera({
  stream,
  error,
}: {
  stream: MediaStream | null;
  error: string | null;
}) {
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
        aria-label="Your camera preview"
      />
      <p>
        {stream
          ? 'Your camera will stay on when you enter the booth.'
          : 'Enable your camera before getting ready.'}
      </p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
