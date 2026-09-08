import { GameEntry } from '@/components/games/game-entry';
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

type Props = {
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
  slot,
}: {
  player: PlayerView;
  isSelf: boolean;
  slot: number;
}) {
  const position = player.selectedActivity
    ? positions[player.selectedActivity]
    : `spawn-${slot}`;
  return (
    <div
      className={`lobby-player lobby-player--${slot} ${position} ${!player.connected ? 'is-offline' : ''}`}
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
  const startedActivity = activities.find(
    (activity) => activity.id === activeActivity,
  );
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
      {!selectedActivity && !startedActivity && (
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
      {selectedActivity &&
      selectedActivity.id !== 'photo-booth' &&
      !activeActivity ? (
        <GameEntry
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
                  onClick={() => onSelectActivity(activity.id)}
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
          <p className="arcade-hint">Choose a station to walk over</p>

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
          ) : selectedActivity ? (
            <aside
              className="activity-waiting-panel"
              aria-label={`${selectedActivity.name} waiting room`}
            >
              <header>
                <div>
                  <p className="pixel-kicker">Waiting room</p>
                  <h2>{selectedActivity.name}</h2>
                </div>
                <span className="waiting-count">
                  {
                    players.filter(
                      (player) =>
                        player.selectedActivity === selectedActivity.id,
                    ).length
                  }
                  /2 here
                </span>
              </header>
              <div className="waiting-players">
                {players.map((player) => {
                  const isHere =
                    player.selectedActivity === selectedActivity.id;
                  return (
                    <div
                      className={`waiting-player ${isHere ? 'is-here' : ''}`}
                      key={player.id}
                    >
                      <span
                        className={`waiting-avatar avatar-art ${player.avatarId}`}
                        aria-hidden="true"
                      />
                      <span>
                        <strong>
                          {player.name}
                          {player.id === selfId ? ' · you' : ''}
                        </strong>
                        <small>
                          {!isHere
                            ? 'Not here yet'
                            : player.ready
                              ? 'Ready!'
                              : 'Getting ready'}
                        </small>
                      </span>
                      <span
                        className={`ready-light ${isHere && player.ready ? 'is-ready' : ''}`}
                        aria-hidden="true"
                      />
                    </div>
                  );
                })}
              </div>
              <p className="waiting-message">
                {players.filter(
                  (player) => player.selectedActivity === selectedActivity.id,
                ).length === 2
                  ? 'You’re both here. The activity starts when you’re both ready.'
                  : 'Waiting for your person to choose this activity.'}
              </p>
              <div className="waiting-actions">
                <PixelButton
                  type="button"
                  variant={self?.ready ? 'secondary' : 'primary'}
                  disabled={status !== 'connected'}
                  onClick={() => onSetReady(selectedActivity.id, !self?.ready)}
                >
                  {self?.ready ? 'Cancel ready' : 'I’m ready'}
                </PixelButton>
                <PixelButton
                  type="button"
                  disabled={status !== 'connected'}
                  onClick={() => onExitActivity(selectedActivity.id)}
                >
                  Exit
                </PixelButton>
              </div>
            </aside>
          ) : null}
        </div>
      )}
    </section>
  );
}
