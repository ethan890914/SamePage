'use client';

import { useState, type SyntheticEvent } from 'react';
import {
  Check,
  Copy,
  Gamepad2,
  KeyRound,
  LogOut,
  Sparkles,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { PixelButton } from '@/components/pixel/pixel-button';
import { PixelField } from '@/components/pixel/pixel-field';
import { PixelPanel } from '@/components/pixel/pixel-panel';
import { PixelStatus } from '@/components/pixel/pixel-status';
import { useRoomConnection } from '@/hooks/use-room-connection';

type EntryMode = 'create' | 'join';

const activities = [
  {
    id: 'converge',
    name: 'Converge',
    detail: 'Find the same word',
    tone: 'pink',
  },
  {
    id: 'pattern-race',
    name: 'Pattern Race',
    detail: 'Think fast, type faster',
    tone: 'cyan',
  },
  {
    id: 'photo-booth',
    name: 'Photo Booth',
    detail: 'Make a tiny memory',
    tone: 'yellow',
  },
] as const;

export default function Home() {
  const [mode, setMode] = useState<EntryMode>('create');
  const [displayName, setDisplayName] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : (localStorage.getItem('same-page.display-name') ?? ''),
  );
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const room = useRoomConnection();
  const busy = ['creating', 'connecting', 'reconnecting'].includes(room.status);
  const inRoom = Boolean(room.roomCode && room.selfId);
  const selfPlayer = room.players.find((player) => player.id === room.selfId);
  const selectedActivity = activities.find(
    (activity) => activity.id === selfPlayer?.selectedActivity,
  );

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === 'create') {
      await room.createRoom(displayName, password);
    } else {
      room.joinRoom(roomCodeInput, displayName, password);
    }
  }

  async function copyRoomCode() {
    if (!room.roomCode) return;
    await navigator.clipboard.writeText(room.roomCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  const statusLabel =
    room.status === 'connected'
      ? 'Connected'
      : room.status === 'reconnecting'
        ? 'Reconnecting'
        : busy
          ? 'Connecting'
          : 'Arcade online';

  return (
    <main className="pixel-world min-h-screen px-4 py-6 text-foreground sm:px-7 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-center justify-between gap-4">
          <a
            className="pixel-logo group"
            href="#top"
            aria-label="Same Page home"
          >
            <span className="pixel-logo-mark" aria-hidden="true">
              SP
            </span>
            <span>
              <strong>Same Page</strong>
              <small>Two-player arcade</small>
            </span>
          </a>
          <PixelStatus label={statusLabel} />
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,.85fr)]">
          <div className="pixel-stage relative min-h-[430px] overflow-hidden p-6 sm:p-9">
            <div className="pixel-stars" aria-hidden="true" />
            <div className="relative z-10 max-w-xl">
              <p className="pixel-kicker">Private room · Couple</p>
              <h1 className="pixel-slogan mt-4 text-balance font-heading text-[clamp(2rem,4vw,4.25rem)] leading-[.98]">
                <span>Different locations,</span>
                <span>different time zones,</span>
                <span>but now on the same page.</span>
              </h1>
              <p className="mt-5 max-w-md text-lg leading-7 text-muted-foreground">
                Your cozy little arcade for quick games, silly moments, and time
                together.
              </p>
            </div>

            <div
              className="relative z-10 mt-10 grid grid-cols-3 gap-3"
              aria-label="Available activities"
            >
              {activities.map((activity) => (
                <button
                  className={`activity-card activity-card--${activity.tone} ${selfPlayer?.selectedActivity === activity.id ? 'is-selected' : ''}`}
                  key={activity.name}
                  type="button"
                  disabled={
                    !inRoom ||
                    room.status !== 'connected' ||
                    Boolean(room.activeActivity)
                  }
                  aria-pressed={selfPlayer?.selectedActivity === activity.id}
                  onClick={() => room.selectActivity(activity.id)}
                >
                  <span className="activity-machine" aria-hidden="true" />
                  <h2>{activity.name}</h2>
                  <p>{activity.detail}</p>
                </button>
              ))}
            </div>
          </div>

          {inRoom ? (
            <PixelPanel
              className="self-start"
              eyebrow="Your private arcade"
              title={`Room ${room.roomCode}`}
            >
              <div className="mb-5 flex gap-2">
                <PixelButton
                  className="min-w-0 flex-1"
                  type="button"
                  onClick={copyRoomCode}
                >
                  {copied ? <Check size={17} /> : <Copy size={17} />}
                  {copied ? 'Copied' : 'Copy room code'}
                </PixelButton>
              </div>

              {room.status === 'reconnecting' && (
                <output className="mb-4 border-2 border-yellow-700 bg-yellow-100 px-3 py-2 text-sm text-yellow-950">
                  Connection lost. Holding your place while we reconnect…
                </output>
              )}

              <div className="space-y-3" aria-label="Players in this arcade">
                {[0, 1].map((slot) => {
                  const player = room.players[slot];
                  const isSelf = player?.id === room.selfId;
                  return (
                    <div
                      className="player-nameplate"
                      key={player?.id ?? `empty-${slot}`}
                    >
                      <span className="player-avatar">
                        <UserRound size={19} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="player-name">
                          {player
                            ? `${player.name}${isSelf ? ' (you)' : ''}`
                            : 'Waiting for player two'}
                        </strong>
                        <small className="player-presence">
                          {player
                            ? player.connected
                              ? 'Online'
                              : 'Reconnecting…'
                            : 'Share the code and password'}
                        </small>
                      </span>
                      <span
                        className={`size-2.5 shrink-0 ${player?.connected ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
                        aria-hidden="true"
                      />
                    </div>
                  );
                })}
              </div>

              {room.activeActivity ? (
                <div className="mt-5 border-2 border-accent bg-accent/10 p-4 text-center">
                  <p className="pixel-kicker">Both ready!</p>
                  <h3 className="mt-2 font-heading text-xl">
                    {
                      activities.find(
                        (activity) => activity.id === room.activeActivity,
                      )?.name
                    }{' '}
                    started
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    You’re synchronized. The game screen comes in the next
                    activity build.
                  </p>
                </div>
              ) : selectedActivity ? (
                <div className="mt-5 border-2 border-border bg-background/50 p-4">
                  <p className="pixel-kicker">Activity waiting room</p>
                  <h3 className="mt-2 font-heading text-xl">
                    {selectedActivity.name}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {room.players.filter(
                      (player) =>
                        player.selectedActivity === selectedActivity.id,
                    ).length === 2
                      ? 'Both players are here. Ready up when you are.'
                      : 'Waiting for your person to choose this activity.'}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <PixelButton
                      type="button"
                      variant={selfPlayer?.ready ? 'secondary' : 'primary'}
                      onClick={() =>
                        room.setReady(selectedActivity.id, !selfPlayer?.ready)
                      }
                    >
                      {selfPlayer?.ready ? 'Cancel ready' : 'Ready'}
                    </PixelButton>
                    <PixelButton
                      type="button"
                      onClick={() => room.exitActivity(selectedActivity.id)}
                    >
                      Exit
                    </PixelButton>
                  </div>
                </div>
              ) : (
                <p className="mt-5 border-t border-border pt-4 text-sm leading-5 text-muted-foreground">
                  Choose an activity in the arcade. Your person will see your
                  choice instantly.
                </p>
              )}
              <PixelButton
                className="mt-4 w-full"
                type="button"
                onClick={room.leaveRoom}
              >
                <LogOut size={17} /> Leave arcade
              </PixelButton>
            </PixelPanel>
          ) : (
            <PixelPanel
              className="self-start"
              eyebrow="Enter the arcade"
              title="Ready when you are"
            >
              <fieldset className="mb-5 grid grid-cols-2 gap-2">
                <legend className="sr-only">Room action</legend>
                <PixelButton
                  pressed={mode === 'create'}
                  onClick={() => {
                    setMode('create');
                    room.clearError();
                  }}
                  disabled={busy}
                  variant="tab"
                >
                  <Sparkles size={17} /> Create
                </PixelButton>
                <PixelButton
                  pressed={mode === 'join'}
                  onClick={() => {
                    setMode('join');
                    room.clearError();
                  }}
                  disabled={busy}
                  variant="tab"
                >
                  <UsersRound size={17} /> Join
                </PixelButton>
              </fieldset>

              <form className="space-y-4" onSubmit={handleSubmit}>
                <PixelField
                  label="Your display name"
                  id="display-name"
                  placeholder="Player one"
                  autoComplete="nickname"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  maxLength={40}
                  required
                  disabled={busy}
                />
                {mode === 'join' && (
                  <PixelField
                    label="Room code"
                    id="room-code"
                    placeholder="MOON-7K2P"
                    autoCapitalize="characters"
                    value={roomCodeInput}
                    onChange={(event) =>
                      setRoomCodeInput(event.target.value.toUpperCase())
                    }
                    pattern="[A-Za-z2-9]{4}-[A-Za-z2-9]{4}"
                    maxLength={9}
                    required
                    disabled={busy}
                  />
                )}
                <PixelField
                  label={
                    mode === 'create'
                      ? 'Choose a room password'
                      : 'Room password'
                  }
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete={
                    mode === 'create' ? 'new-password' : 'current-password'
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  maxLength={128}
                  required
                  disabled={busy}
                />
                {room.error && (
                  <p
                    className="border-2 border-red-700 bg-red-100 px-3 py-2 text-sm text-red-950"
                    role="alert"
                  >
                    {room.error}
                  </p>
                )}
                <PixelButton
                  className="mt-2 w-full"
                  type="submit"
                  variant="primary"
                  disabled={busy}
                >
                  <Gamepad2 size={19} />{' '}
                  {busy
                    ? room.status === 'creating'
                      ? 'Creating arcade…'
                      : 'Connecting…'
                    : mode === 'create'
                      ? 'Create arcade'
                      : 'Join arcade'}
                </PixelButton>
              </form>

              <div className="mt-5 flex items-start gap-3 border-t border-border pt-4 text-sm leading-5 text-muted-foreground">
                <KeyRound className="mt-0.5 shrink-0 text-accent" size={17} />
                <p>
                  Your room stays private. Share the code and password with your
                  person.
                </p>
              </div>
            </PixelPanel>
          )}
        </section>

        <footer className="mt-5 flex flex-wrap items-center justify-between gap-2 px-1 text-xs uppercase tracking-[.12em] text-muted-foreground">
          <span>No account needed</span>
          <span>Best enjoyed together</span>
        </footer>
      </div>
    </main>
  );
}
