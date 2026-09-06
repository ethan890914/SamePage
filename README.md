# Same Page

A private two-player browser arcade for short shared activities during a call.

## Local development

Requires Node.js 22.13 or newer.

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env.local` when the realtime Worker is introduced.

## Project map

- `app/` — application routes, layout, and global design tokens
- `components/pixel/` — reusable Same Page visual primitives
- `components/ui/` — accessible lower-level interface primitives
- `lib/protocol.ts` — shared room and activity message types
- `docs/architecture.md` — intended V1 boundaries and delivery sequence
- `AGENT.md` — complete V1 product specification

The current scaffold includes the entry experience and visual system. Room creation, WebSocket transport, and Durable Object state are the next implementation slice.
