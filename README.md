# Same Page

A private two-player browser arcade for short shared activities during a call.

## Local development

Requires Node.js 22.13 or newer.

```sh
npm install
npm run dev
```

In a second terminal, run the realtime Worker:

```sh
cp .env.example .env.local
cp .dev.vars.example .dev.vars
npm run dev:realtime
```

The frontend runs on its Vinext development URL and the realtime service runs
on `http://localhost:8787`. Its health endpoint is `/api/health`. Create rooms
with `POST /api/rooms`, then connect to
`ws://localhost:8787/api/rooms/{ROOM-CODE}/socket`. The socket's first message
must be `join_room` or `reconnect` from the shared protocol.

The page's Create and Join controls use these endpoints directly. Each player
chooses one of eight avatars before entering. Open the
frontend in two browser sessions to create a room, share its code and password,
and verify the two-player lobby. Refreshing or briefly losing the connection
keeps a player's slot for 45 seconds.

Players can choose a spot in the shared home, see each other's avatar move to it,
enter its shared waiting room, and toggle ready. Switching activities or exiting
clears the affected ready state for both players. When both players choose the
same activity and become ready, both clients receive the same activity instance.
The individual game screens are the next product slice.

Run the realtime integration check with:

```sh
npm run test:realtime
```

For production, configure `ROOM_PASSWORD_PEPPER` as a Worker secret, set
`ALLOWED_ORIGINS` to the deployed frontend origin, and put Cloudflare Access in
front of both the frontend and realtime Worker routes.

## Project map

- `app/` — application routes, layout, and global design tokens
- `components/pixel/` — reusable Same Page visual primitives
- `components/lobby/` — room entry, avatar selection, shared home, and waiting UI
- `components/ui/` — accessible lower-level interface primitives
- `lib/protocol.ts` — shared room and activity message types
- `worker/` — standalone realtime Worker and Durable Object boundary
- `wrangler.realtime.jsonc` — realtime Worker bindings and migration
- `docs/architecture.md` — intended V1 boundaries and delivery sequence
- `AGENT.md` — complete V1 product specification

The room, reconnect, and shared activity-waiting flows are implemented. The game
loops and photo booth are the next implementation slices.
