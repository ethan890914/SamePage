import { GameEntry } from '@/components/games/game-entry';
import { useEffect, useState, type ReactNode } from 'react';
import type { ConvergeSettings } from '@/lib/game-settings';
import { Check, Copy, LogOut, X } from 'lucide-react';
import Image from 'next/image';
import { PixelButton } from '@/components/pixel/pixel-button';
import type { ActivityId, PlayerView } from '@/lib/protocol';
import { activities } from './activities';

const positions: Record<ActivityId, string> = {
  converge: 'station-converge',
  'pattern-race': 'station-pattern',
  'photo-booth': 'station-photo',
};

const WALK_DURATION_MS = 760;

type Props = {
  boothCamera: ReactNode;
  boothCameraReady: boolean;
  boothCameraBusy: boolean;
  onEnableBoothCamera: () => void;
  boothCountdownSeconds: number;
  onBoothCountdown: (seconds: number) => void;
  convergeSettings: ConvergeSettings;
  onConvergeSettings: (settings: ConvergeSettings) => void;
  activeActivity: ActivityId | null;
  copied: boolean;
  players: PlayerView[];
  roomCode: string;
  selfId: string;
  status: string;
  error: string | null;
  onCopyRoomCode: () => void;
  onClearError: () => void;
  onExitActivity: (activityId: ActivityId) => void;
  onLeave: () => void;
  onSetReady: (activityId: ActivityId, ready: boolean) => void;
  onSelectActivity: (activityId: ActivityId) => void;
};

function PlayerSprite({
  player,
  isSelf,
  isWalking,
  slot,
}: {
  player: PlayerView;
  isSelf: boolean;
  isWalking: boolean;
  slot: number;
}) {
  const position = player.selectedActivity
    ? positions[player.selectedActivity]
    : `spawn-${slot}`;
  return (
    <div
      className={`lobby-player lobby-player--${slot} ${position} ${isWalking ? 'is-walking' : ''} ${!player.connected ? 'is-offline' : ''}`}
    >
      <span
        className={`avatar-sprite avatar-art ${player.avatarId}`}
        aria-hidden="true"
      />
      <span className="avatar-label">
        {player.name}
        {isSelf ? ' · you' : ''}
      </span>
      <span className="sr-only">
        {player.connected ? 'Online' : 'Reconnecting'}
      </span>
    </div>
  );
}

export function ArcadeLobby({
  boothCamera,
  boothCameraReady,
  boothCameraBusy,
  onEnableBoothCamera,
  boothCountdownSeconds,
  onBoothCountdown,
  convergeSettings,
  onConvergeSettings,
  activeActivity,
  copied,
  players,
  roomCode,
  selfId,
  status,
  error,
  onCopyRoomCode,
  onClearError,
  onExitActivity,
  onLeave,
  onSetReady,
  onSelectActivity,
}: Props) {
  const self = players.find((player) => player.id === selfId);
  const selectedActivity = activities.find(
    (activity) => activity.id === self?.selectedActivity,
  );
  const [enteredActivityId, setEnteredActivityId] = useState<ActivityId | null>(
    null,
  );
  const startedActivity = activities.find(
    (activity) => activity.id === activeActivity,
  );
  const isWalking = Boolean(
    selectedActivity && enteredActivityId !== selectedActivity.id,
  );
  const showActivityEntry = Boolean(
    selectedActivity && enteredActivityId === selectedActivity.id,
  );

  useEffect(() => {
    if (!selectedActivity) return;

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const timeout = window.setTimeout(
      () => setEnteredActivityId(selectedActivity.id),
      reducedMotion ? 0 : WALK_DURATION_MS,
    );

    return () => window.clearTimeout(timeout);
  }, [selectedActivity]);

  return (
    <section
      className="lobby-shell"
      aria-label={
        selectedActivity || startedActivity
          ? `${(selectedActivity ?? startedActivity)?.name} activity`
          : undefined
      }
      aria-labelledby={
        selectedActivity || startedActivity ? undefined : 'lobby-title'
      }
    >
      {!showActivityEntry && !startedActivity && (
        <header className="lobby-toolbar">
          <div>
            <p className="pixel-kicker">Your shared place</p>
            <h1 id="lobby-title" className="font-heading text-xl sm:text-2xl">
              Room {roomCode}
            </h1>
          </div>
          <div className="lobby-actions">
            <PixelButton type="button" onClick={onCopyRoomCode}>
              {copied ? <Check size={17} /> : <Copy size={17} />}
              {copied ? 'Copied' : 'Copy code'}
            </PixelButton>
            <PixelButton type="button" onClick={onLeave}>
              <LogOut size={17} /> Leave
            </PixelButton>
          </div>
        </header>
      )}
      {status === 'reconnecting' && (
        <output className="lobby-alert">
          Connection lost. Holding your place…
        </output>
      )}
      {error && (
        <div className="lobby-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={onClearError}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {selectedActivity && showActivityEntry && !activeActivity ? (
        <GameEntry
          camera={boothCamera}
          cameraBusy={boothCameraBusy}
          onEnableCamera={onEnableBoothCamera}
          cameraReady={
            selectedActivity.id !== 'photo-booth' || boothCameraReady
          }
          countdownSeconds={boothCountdownSeconds}
          onCountdown={onBoothCountdown}
          activityId={selectedActivity.id}
          players={players}
          selfId={selfId}
          status={status}
          settings={convergeSettings}
          onSettings={onConvergeSettings}
          onReady={(ready) => onSetReady(selectedActivity.id, ready)}
          onExit={() => onExitActivity(selectedActivity.id)}
        />
      ) : (
        <div className="arcade-room" aria-label="Choose an activity spot">
          <Image
            className="arcade-room-art"
            src="/images/cozy-home-lobby.png"
            alt=""
            width={1536}
            height={1024}
            priority
          />
          <div className="station-grid">
            {activities.map((activity) => {
              const count = players.filter(
                (player) => player.selectedActivity === activity.id,
              ).length;
              const selected = self?.selectedActivity === activity.id;
              return (
                <button
                  className={`arcade-station arcade-station--${activity.tone} ${selected ? 'is-selected' : ''}`}
                  key={activity.id}
                  type="button"
                  disabled={status !== 'connected' || Boolean(activeActivity)}
                  aria-pressed={selected}
                  onClick={() => {
                    if (selectedActivity?.id !== activity.id) {
                      setEnteredActivityId(null);
                    }
                    onSelectActivity(activity.id);
                  }}
                >
                  <span className="station-screen" aria-hidden="true">
                    <i />
                  </span>
                  <span className="station-copy">
                    <strong>{activity.name}</strong>
                    <small>{activity.detail}</small>
                  </span>
                  <span
                    className="station-count"
                    aria-label={`${count} players here`}
                  >
                    {count}/2
                  </span>
                </button>
              );
            })}
          </div>
          {players.map((player, index) => (
            <PlayerSprite
              key={player.id}
              player={player}
              isSelf={player.id === selfId}
              isWalking={player.id === selfId && isWalking}
              slot={index}
            />
          ))}
          {players.length < 2 && (
            <div className="empty-player-slot">
              <span className="empty-avatar" aria-hidden="true">
                ?
              </span>
              <span>Waiting for player two</span>
            </div>
          )}
          <p className="arcade-hint" aria-live="polite">
            {isWalking && selectedActivity
              ? `Walking to ${selectedActivity.name}…`
              : 'Choose a station to walk over'}
          </p>

          {startedActivity ? (
            <output className="activity-started-panel">
              <p className="pixel-kicker">Both ready!</p>
              <h2>{startedActivity.name}</h2>
              <p>
                {startedActivity.id === 'photo-booth'
                  ? 'Waiting for both of you to reconnect to the booth…'
                  : 'Your game setup is ready. Gameplay is coming next.'}
              </p>
              {
                <PixelButton
                  disabled={status !== 'connected'}
                  onClick={() => onExitActivity(startedActivity.id)}
                >
                  Back to lobby
                </PixelButton>
              }
            </output>
          ) : null}
        </div>
      )}
    </section>
  );
}
