# Shared photo booth

Both players select Photo Booth in the lobby and see an entry screen matching
Converge. They enable and preview their cameras, choose a shared 10, 12, or
15-second countdown (default 10), and get ready. Changing the setting clears both
ready flags. Camera streams carry into the booth without another permission request.
Inside the booth, they choose a frame and sides, and mark themselves ready. When both are ready, the enabled
start button counts down from three and the session starts automatically. Either
person can click it to start sooner. Cancelling ready cancels the shared countdown.
Every shot uses the selected countdown, with a one-second flash interval between shots.
The resulting PNG contains four rows, each with the same left/right player pairing.

## Implementation

- The room Durable Object owns frame, left player ID, readiness, take ID and start
  timestamp. Authenticated, instance-scoped commands validate all inputs. Frame and
  position controls lock during capture; retaking preserves frame and side choices.
- WebRTC carries video only and a reliable data channel carries crop settings and
  JPEG chunks. A small hello handshake waits for both peers before negotiating.
  Reconnect cameras restarts both peers. Room disconnects cancel the active take.
- Only the offerer creates a video transceiver. After receiving the offer, the
  answerer reuses its negotiated video transceiver and sets it to send/receive.
  Camera permission can arrive before or after negotiation; the track attaches
  to that explicit sender. This avoids the unassociated local transceiver case
  described in the [WebRTC specification](https://www.w3.org/TR/webrtc/).
- A Durable Object alarm owns the shared three-second start deadline. Manual
  starts and the alarm use the same guarded transition, so a late click cannot
  create a second take. Unreadying, swapping sides, resetting, and disconnecting
  cancel the deadline. The configurable countdown for every photo is independent.
- Each camera is captured locally at start + countdown + index × (countdown + 1)
  seconds; at the default this is 10, 21, 32, and 43 seconds. Server
  timestamps estimate clock offsets; browser scheduling and network delay mean
  synchronization is approximate. Unfocused/hidden windows with live camera
  frames can still capture; brief timer delays are tolerated. A timer delayed by
  ten seconds or more fails instead of producing catch-up photos after suspension.
  Camera, frame-readiness, connection, and timer failures have distinct messages.
  Missing transfers time out.
- Preview and capture use the same canvas cropping/mirroring function. Source
  images are 600 × 600 per person. Export is a 1280 × 2850 PNG, composed locally
  from both sets of stills. No image bytes are written to the room or server storage.
- Camera tracks stop on exiting the photo booth activity or closing the page.
  Brief room disconnects preserve the entry-owned camera for reconnection. Refreshing loses photos;
  users need to retake. Returning to the lobby ends the booth for both players.

## Optional shared background

After all eight original portraits arrive, a separate classic Web Worker runs
MediaPipe SelfieSegmenter on the still images and returns transparent PNG cutouts.
Each browser processes its existing originals locally; camera capture, streaming,
countdowns, and the room protocol are unchanged. Cutouts sit over one continuous
blue studio gradient per row, preserving the agreed player positions.

The original strip renders immediately and stays downloadable during processing.
“Keep original” cancels processing. Once ready, the Shared background switch
compares both versions; filenames identify the selected version. Failure, missing
person masks, unsupported workers/OffscreenCanvas, or a 90-second timeout leave
the original available, with a retry button. No partial processed strip is shown.
Retaking or leaving terminates processing and releases the generated image URLs.

Runtime/model assets are served by the app; photos are not sent to a segmentation
service. The first run loads roughly 11 MB of WASM plus the library and 244 KB
model. There is no per-frame segmentation or inference during the live preview.
See `public/models/README.md` for model provenance. The media library is copied
by the `predev`/`prebuild` scripts; generated copies are ignored by Git.

`node --test scripts/booth-background.test.mjs` verifies worker processing,
alpha masks, preservation of inputs, and all-or-nothing failure behavior using
simulated inference. Actual model quality and browser compatibility still need
evaluation on the user's portraits.

## Deployment

The frontend and realtime Worker retain their existing separate deployment flow.
Set the frontend's `NEXT_PUBLIC_REALTIME_URL` to the deployed Worker WSS origin,
and include the frontend HTTPS origin in the Worker's `ALLOWED_ORIGINS`.

For reliable connections on different networks, configure `TURN_URLS` and the
server-only `TURN_SHARED_SECRET` for a TURN service supporting the coturn REST
HMAC-SHA1 credential scheme. Authenticated booth participants receive credentials
expiring in one hour. The browser otherwise uses STUN and direct connections only.
Do not expose the shared secret in frontend environment variables. No TURN service
is provisioned automatically by this change.

## Verification

`npm run test:realtime` checks shared frames and positions, readiness, scheduling,
automatic/manual starts, countdown cancellation, duplicate starts, capture locks,
signal routing, invalid/stale commands, retakes,
and returning to the lobby, alongside existing room checks.

`node --test scripts/booth-camera.test.mjs` checks camera attachment before and
after negotiation on both peers, including the orphan sender regression, using
a model of WebRTC transceiver association. It does not replace live browser tests.

Manual acceptance on two devices: permit both cameras, verify mirrored/unmirrored
preview and crop, swap sides, take all four shots, compare PNGs, switch frames,
retake, deny permission, interrupt a camera/connection, and refresh. Also test
across different networks with TURN and on mobile Safari. These camera/browser
acceptance checks require real browser sessions and have not been automated.
