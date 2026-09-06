# V1 architecture

## Runtime boundaries

The browser owns display-name persistence, the reconnect session token, camera capture, and cosmetic lobby animation. It never decides room capacity, password validity, readiness, game outcomes, or timers.

The Cloudflare Worker routes room requests, rate-limits join attempts, and upgrades valid requests to WebSockets. One Durable Object instance owns each room and serializes its two players' state transitions.

The shared protocol in `lib/protocol.ts` is the contract between those surfaces. Messages will be runtime-validated at the Worker boundary before they reach game logic.

## Frontend structure

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
