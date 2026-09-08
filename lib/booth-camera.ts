/** Capture from a live camera regardless of window focus or page visibility. */
export function captureBoothFrame(
  video: HTMLVideoElement | null,
  stream: MediaStream | null,
  channel: RTCDataChannel | null,
  lateByMs: number,
  draw: (ctx: CanvasRenderingContext2D, video: HTMLVideoElement) => void,
): string {
  if (channel?.readyState !== 'open')
    throw new Error(
      'The photo connection closed. Reconnect cameras and retake the strip.',
    );
  const track = stream?.getVideoTracks().find((t) => t.readyState === 'live');
  if (!track)
    throw new Error(
      'Your camera stopped. Enable it again, then retake the strip.',
    );
  if (track.muted || !track.enabled)
    throw new Error(
      'Your browser paused the camera. Resume camera access, then retake the strip.',
    );
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight)
    throw new Error(
      'Your camera has not supplied a frame yet. Wait for your preview, then retake the strip.',
    );
  // Brief background timer delays are fine. Do not turn a suspended browser's
  // queued timers into multiple photos of the same instant when it resumes.
  if (lateByMs >= 10_000)
    throw new Error(
      'The browser paused the photo timer for too long. Restore the window and retake the strip.',
    );
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not capture this photo.');
  draw(ctx, video);
  return canvas.toDataURL('image/jpeg', 0.9);
}

/** Own the single negotiated video channel, even when camera permission arrives later. */
export class BoothCamera {
  private sender: RTCRtpSender | null = null;
  private track: MediaStreamTrack | null = null;

  constructor(private readonly peer: RTCPeerConnection) {}

  async prepareOffer() {
    const transceiver = this.peer.addTransceiver('video', {
      direction: 'sendrecv',
    });
    this.sender = transceiver.sender;
    await this.sender.replaceTrack(this.track);
  }

  async prepareAnswer() {
    // setRemoteDescription(offer) creates the answerer's negotiated transceiver.
    // A locally addTransceiver-created channel would remain unassociated.
    const transceiver = this.peer
      .getTransceivers()
      .find((t) => t.mid !== null && t.receiver.track.kind === 'video');
    if (!transceiver)
      throw new Error('The other camera did not offer a video connection.');
    transceiver.direction = 'sendrecv';
    this.sender = transceiver.sender;
    await this.sender.replaceTrack(this.track);
  }

  async setTrack(track: MediaStreamTrack) {
    this.track = track;
    if (this.sender) await this.sender.replaceTrack(track);
  }
}
