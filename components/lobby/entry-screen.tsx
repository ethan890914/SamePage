import type { SyntheticEvent } from 'react';
import { Gamepad2, KeyRound, Sparkles, UsersRound } from 'lucide-react';
import { PixelButton } from '@/components/pixel/pixel-button';
import { PixelField } from '@/components/pixel/pixel-field';
import { PixelPanel } from '@/components/pixel/pixel-panel';
import type { AvatarId } from '@/lib/protocol';
import { AvatarPicker } from './avatar-picker';

export type EntryMode = 'create' | 'join';

type Props = {
  busy: boolean;
  displayName: string;
  error: string | null;
  mode: EntryMode;
  password: string;
  roomCode: string;
  selectedAvatar: AvatarId;
  status: string;
  onDisplayNameChange: (value: string) => void;
  onModeChange: (mode: EntryMode) => void;
  onPasswordChange: (value: string) => void;
  onRoomCodeChange: (value: string) => void;
  onAvatarChange: (avatarId: AvatarId) => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
};

export function EntryScreen(props: Props) {
  const {
    busy,
    displayName,
    error,
    mode,
    password,
    roomCode,
    selectedAvatar,
    status,
    onDisplayNameChange,
    onModeChange,
    onPasswordChange,
    onRoomCodeChange,
    onAvatarChange,
    onSubmit,
  } = props;
  return (
    <section className="entry-layout">
      <div className="entry-hero pixel-stage">
        <div className="pixel-stars" aria-hidden="true" />
        <div className="relative z-10 max-w-2xl">
          <p className="pixel-kicker">A private arcade for two</p>
          <h1 className="pixel-slogan mt-4 text-balance font-heading text-[clamp(2.5rem,5vw,5.4rem)] leading-[.92]">
            <span>Different locations,</span>
            <span>Different time zones,</span>
            <span>But now on the Same Page.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-7 text-muted-foreground">
            Open a room during your call, share the code, and meet your person
            inside.
          </p>
        </div>
        <div className="entry-marquee" aria-hidden="true">
          <span>CONVERGE</span>
          <span>PATTERN RACE</span>
          <span>PHOTO BOOTH</span>
        </div>
      </div>
      <PixelPanel
        className="entry-panel self-start"
        eyebrow="Enter the arcade"
        title="Ready when you are"
      >
        <fieldset className="mb-5 grid grid-cols-2 gap-2">
          <legend className="sr-only">Room action</legend>
          <PixelButton
            pressed={mode === 'create'}
            onClick={() => onModeChange('create')}
            disabled={busy}
            variant="tab"
          >
            <Sparkles size={17} /> Create
          </PixelButton>
          <PixelButton
            pressed={mode === 'join'}
            onClick={() => onModeChange('join')}
            disabled={busy}
            variant="tab"
          >
            <UsersRound size={17} /> Join
          </PixelButton>
        </fieldset>
        <form className="space-y-4" onSubmit={onSubmit}>
          <AvatarPicker
            disabled={busy}
            selected={selectedAvatar}
            onSelect={onAvatarChange}
          />
          <PixelField
            label="Your display name"
            id="display-name"
            placeholder="Player one"
            autoComplete="nickname"
            value={displayName}
            onChange={(event) => onDisplayNameChange(event.target.value)}
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
              value={roomCode}
              onChange={(event) =>
                onRoomCodeChange(event.target.value.toUpperCase())
              }
              pattern="[A-Za-z2-9]{4}-[A-Za-z2-9]{4}"
              maxLength={9}
              required
              disabled={busy}
            />
          )}
          <PixelField
            label={
              mode === 'create' ? 'Choose a room password' : 'Room password'
            }
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete={
              mode === 'create' ? 'new-password' : 'current-password'
            }
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            minLength={8}
            maxLength={128}
            required
            disabled={busy}
          />
          {error && (
            <p
              className="border-2 border-red-700 bg-red-100 px-3 py-2 text-sm text-red-950"
              role="alert"
            >
              {error}
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
              ? status === 'creating'
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
    </section>
  );
}
