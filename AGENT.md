# Same Page — Agent Build Spec (V1)

## 1. Concept

A private, two-person web portal opened during a video call for short (2–20 min)
shared activities. Not a daily-use app — no streaks, no habit tracking, no
accounts required for V1. The goal is a delightful, low-friction "open this and
play together" experience.

## 2. Stack

- Frontend: React + TypeScript + Vite
- Hosting: Cloudflare Pages (static frontend)
- Realtime/session state: Cloudflare Worker + Durable Object (one DO instance
  per arcade room)
- Access gate: Cloudflare Access (email OTP, allowlist of the two users' emails)
  sits in front of the whole domain, independent of the app's own room/password
  logic
- Optional later: Cloudflare R2 for saved photo strips (not required for V1)

## 3. Access & Security

- Cloudflare Access gates the entire domain before any request reaches the app
  (see prior discussion — email OTP, two allowed emails, no app code changes
  needed).
- Inside the app, a room is protected by a room code + password, both checked
  server-side in the Durable Object (never trust a client-side check alone).
- Room codes: long/random enough to not be practically guessable (avoid short
  sequential codes).
- Rate-limit join/password attempts per room (per IP) in the Worker.
- All free-text user input (names, in-game words) renders as text content only
  — never `innerHTML` / `dangerouslySetInnerHTML`.
- The Durable Object validates the shape of every incoming message before
  broadcasting or acting on it — never trust and forward client input blindly.
- No secrets (API tokens, keys) ever ship in frontend bundle code — Worker env
  vars only.

## 4. Lobby & Session System

### 4.1 Entry flow

1. User lands on the site (already past Cloudflare Access).
2. Prompted for a display name (stored client-side only, no account).
3. Choose **Create arcade** or **Join arcade**.
   - Create: generates a new room code + lets the user set a password;
     spins up a new Durable Object instance for that room.
   - Join: user enters an existing room code + password.

### 4.2 Room capacity & identity

- Max 2 occupants per room, enforced **server-side** in the Durable Object —
  a 3rd join attempt (even with correct code/password) is rejected once two
  valid occupants are present.
- On first successful join, the client generates a random session token,
  stores it in `localStorage`, and sends it with every reconnect.
- The Durable Object tracks occupancy by session token, not raw connection:
  - A reconnect presenting an existing token reclaims that same slot.
  - On disconnect, the slot is held for a grace period (~30–60s) before being
    freed, so a refresh or brief network drop doesn't kick the user out or
    free the slot to a third party.
  - A join with no matching token and no free slot is rejected.

### 4.3 Failure/edge cases to handle explicitly

- Wrong password: rejected, rate-limited.
- Room full: rejected with a clear "arcade is full" message.
- Session expired / slot reclaimed by grace-period timeout: user is dropped
  back to the entry screen and must rejoin as a new participant.

## 5. Portal UI

### 5.1 V1 — static pixel lobby, no free movement

- Pixel-art, Gather Town-styled background image for the shared arcade space.
- Activities are represented as clickable stations/icons (not walked to via
  keyboard control in V1).
- On selecting an activity, the user's avatar plays a **local, scripted**
  walk-to-the-station animation — this is cosmetic only and does not require
  syncing continuous position data between clients.
- The only network event needed here is a single discrete message: "player X
  selected activity Y."

### 5.2 Activity waiting room (applies to every game)

Each activity has its own small state machine, held as part of the shared
Durable Object room state:

1. **Empty** — no one has entered this activity.
2. **One player waiting** — first player is in, sees a waiting room with
   Ready / Cancel Ready / Exit controls.
3. **Both players present** — second player joined; either can toggle ready
   independently.
4. **Both ready → activity starts** — triggered the instant both ready flags
   are true at the same time.

Edge-case rules:

- A player exiting the activity clears their presence and resets both ready
  flags, dropping the state back to "one player waiting" (or "empty" if both
  leave).
- Refresh/disconnect while in a waiting room uses the same session-token +
  grace-period reconnect logic as the top-level room (do not treat a refresh
  as an exit).
- Selecting a different activity while already waiting in one auto-exits the
  first (a player can only be in one activity room at a time).
- Un-readying is instant, no confirmation, but must immediately update the
  other player's UI.

### 5.3 Roadmap (not V1 scope)

- V2: user-controlled avatar movement around the pixel lobby, desktop only
  (keyboard input; no mobile touch controls in V2).
- V3: further enhancements, e.g. account-based verification/identity beyond
  the shared room model.

## 6. Activities

### 6.1 Photo Booth

- Fully client-side (camera access via `getUserMedia`, capture via canvas).
- No server/Durable Object involvement required for the core capture flow.
- Optional: synchronized countdown so both clients snap at the same moment —
  this needs one shared "countdown started" broadcast event from the DO, not
  continuous sync.
- Photos are ephemeral by default (kept in browser memory/session only);
  only persist to storage (e.g. R2, later) if a user explicitly saves.

### 6.2 Game 1 — "Converge" (word convergence)

**Goal:** both players land on the same word.

Flow:

1. **Round 1 (free choice):** both players privately submit any word,
   simultaneously and hidden from each other (same blind-submit-then-reveal
   pattern as a "Same Answer"-style activity).
2. Server (Durable Object) reveals both words once both are submitted.
3. **If the words match:** round won — show a celebratory reveal, end game
   (or offer "play again").
4. **If they don't match:** start a **10-second countdown**. During this
   window, each player must submit a new word that they judge to be related
   to the pair of words just revealed.
   - No server-side "relatedness" validation — this is a social/creative
     judgment call between the two players, not something the system checks.
5. Repeat step 2–4 (reveal → compare → 10s round if no match) until both
   words match.

Open design decisions to confirm before building:

- What happens if a player fails to submit before the 10s timer elapses?
  (Suggested default: treat as no-match and immediately start a fresh 10s
  round on the same base words, rather than ending the game.)
- Whether there's a max round count / "give up and reveal both words" escape
  hatch, in case convergence never happens.

### 6.3 Game 2 — "Pattern Race" (fill-the-blank word race)

**Goal:** be the first to name a real word matching a given pattern.

Flow:

1. Server randomly generates a constraint: a first letter, a last letter, and
   a word length (e.g. `A _ _ _ E` = 5 letters, starts with A, ends with E).
   This does not require a secret target word — it's just a constraint spec.
2. Both players see the same pattern and race to submit a word.
3. Server validates each submission against: (a) matches the pattern exactly
   (length, first letter, last letter), and (b) exists in a bundled
   dictionary/wordlist.
4. Because the Durable Object serializes incoming messages, "who was first"
   is resolved naturally by message arrival order — the first valid
   submission wins the round; the losing/late submission (even if also
   valid) does not count.
5. Reveal the winner and their word to both players; offer next round.

Open design decisions to confirm before building:

- Which dictionary/wordlist to bundle for validation (needs to be
  reasonably comprehensive but exclude obscure/offensive entries).
- Whether an invalid submission (real-looking but not in the dictionary, or
  mismatched pattern) should show an inline error to that player without
  ending the round for the other player.
- Difficulty tuning: constrained word-length ranges (e.g. avoid 3-letter
  patterns that are too easy / 9-letter patterns that may have no valid
  words).

## 7. Client–Server Message Protocol (Durable Object)

All realtime communication goes through a single WebSocket connection per
client to the room's Durable Object. Suggested message categories:

**Session/room level**

- `join_room` (session token, name, password) → `join_accepted` /
  `join_rejected` (reason: full, bad_password, etc.)
- `reconnect` (session token) → `reconnect_accepted` / `reconnect_rejected`
- `leave_room`

**Activity/lobby level**

- `select_activity` (activity id)
- `enter_activity` / `exit_activity` (activity id)
- `ready` / `unready`
- `activity_started` (broadcast, both clients transition into the game UI)

**Game-specific**

- Converge: `submit_word`, `round_reveal` (both words + match/no-match),
  `round_timer_start` (10s), `game_won`
- Pattern Race: `round_pattern` (constraint spec, broadcast to both),
  `submit_guess`, `guess_rejected` (invalid word/pattern mismatch),
  `round_won` (winner + word, broadcast to both)

**Photo Booth (if synchronized capture is included)**

- `countdown_start`, `capture_now` (broadcast trigger)

## 8. Shared State Shape (per Durable Object / room)

Rough shape to hold in the Durable Object:

- `occupants`: up to 2 entries, each `{ sessionToken, name, connected,
lastSeenAt }`
- `currentActivity`: which activity (if any) is currently in progress
- `activityState`: per-activity waiting-room state (empty / one-waiting /
  both-present / both-ready) plus per-player ready flags
- `gameState`: activity-specific in-progress data, e.g. for Converge: current
  round's revealed words + round number; for Pattern Race: current pattern
  constraint + round status

## 9. Out of scope for V1 (explicitly deferred)

- User-controlled avatar movement (V2)
- Mobile touch controls for movement (V2, desktop-only initially)
- Persistent accounts / cross-session identity (V3)
- Persistent photo storage beyond the current session (later, optional, R2)
- Any real-time "relatedness" validation for Converge — it's judged by the
  players, not the system
