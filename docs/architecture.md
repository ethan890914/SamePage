# V1 architecture

## Runtime boundaries

The browser owns display-name persistence, the reconnect session token, camera capture, and cosmetic lobby animation. It never decides room capacity, password validity, readiness, game outcomes, or timers.

The Cloudflare Worker routes room requests, rate-limits join attempts, and upgrades valid requests to WebSockets. One Durable Object instance owns each room and serializes its two players' state transitions.

The Vinext application and realtime Worker deploy independently. The browser
uses `NEXT_PUBLIC_REALTIME_URL` to reach the Worker. In production, Cloudflare
Access must cover both origins so protecting the page cannot be bypassed by
calling the realtime API directly.

The shared protocol in `lib/protocol.ts` is the contract between those surfaces. Messages will be runtime-validated at the Worker boundary before they reach game logic.

Room creation reserves the creator's slot for 60 seconds. Passwords are stored
as salted, peppered verifiers, and session tokens are stored as hashes. A
socket authenticates with its first protocol message. When the same participant
opens another connection, the newest connection replaces the older one.
Disconnected participants retain their slot for 45 seconds. The Durable Object
stores that deadline and schedules an alarm; reconnecting clears the deadline,
while alarm expiry releases the slot and broadcasts a new room snapshot.

Room creation is limited at the Worker edge. Each room also persists a bounded
password-attempt window keyed by a one-way client identifier, so repeated bad
passwords are rejected before another expensive verification. The Worker limits
payload size and the Durable Object validates every WebSocket command.

## Frontend structure

Follow [the design guidelines](design.md) for settings controls and game typography, including the shared `< value >` selector pattern for future features.

Reusable visual primitives live in `components/pixel`. Global semantic colors, type roles, pixel borders, focus styles, and motion rules live in `app/globals.css`. Activity screens should compose those primitives instead of introducing isolated colors, shadows, or input styles.

## Delivery slices

1. Create and join a room across two browser sessions.
2. Reconnect into a held player slot after refresh or a brief disconnect.
3. Select an activity and complete the shared ready-state flow.
4. Add Converge, then Pattern Race, then the client-side Photo Booth.
5. Configure Cloudflare Access and deploy the frontend and Worker.

## Server state rules

- Keep password hashes and session tokens out of player-visible snapshots.
- Persist room metadata and active game state when it must survive object eviction.
- Store deadlines as server timestamps and use alarms for disconnect grace periods and round timers.
- Include a protocol version and game/round identifier in state-changing messages before implementing game loops.
