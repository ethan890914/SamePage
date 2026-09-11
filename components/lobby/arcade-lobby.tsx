import { useLanguage } from '@/lib/i18n/provider';
import { GameEntry } from '@/components/games/game-entry';
import { useEffect, useState, type ReactNode } from 'react';
import type {
  ConvergeSettings,
  PatternRaceSettings,
  MinesweeperSettings,
  ColorPickerSettings,
} from '@/lib/game-settings';
import { ArrowLeft, Check, Copy, LogOut, X } from 'lucide-react';
import Image from 'next/image';
import { PixelButton } from '@/components/pixel/pixel-button';
import type { ActivityId, PlayerView } from '@/lib/protocol';
import { activities } from './activities';

const positions: Record<ActivityId, string> = {
  'color-picker': 'station-arcade',
  minesweeper: 'station-arcade',
  converge: 'station-arcade',
  'pattern-race': 'station-arcade',
  'photo-booth': 'station-photo',
};

type LobbyArea = 'photo-booth' | 'arcade' | 'board-games';

const lobbyAreas: {
  id: LobbyArea;
  name: string;
  detail: string;
  tone: 'pink' | 'cyan' | 'yellow';
}[] = [
  {
    id: 'photo-booth',
    name: 'Photo Booth',
    detail: 'Make a tiny memory',
    tone: 'pink',
  },
  {
    id: 'arcade',
    name: 'Arcade',
    detail: 'Four games inside',
    tone: 'cyan',
  },
  {
    id: 'board-games',
    name: 'Board Games',
    detail: 'A cozy table for two',
    tone: 'yellow',
  },
];

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
  colorPickerSettings: ColorPickerSettings;
  onColorPickerSettings: (settings: ColorPickerSettings) => void;
  patternRaceSettings: PatternRaceSettings;
  minesweeperSettings: MinesweeperSettings;
  onMinesweeperSettings: (settings: MinesweeperSettings) => void;
  onPatternRaceSettings: (settings: PatternRaceSettings) => void;
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
  localArea,
}: {
  player: PlayerView;
  isSelf: boolean;
  isWalking: boolean;
  slot: number;
  localArea?: LobbyArea | null;
}) {
  const { t } = useLanguage();
  const position = localArea
    ? `station-${localArea}`
    : player.selectedActivity
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
        {isSelf ? t(' · you') : ''}
      </span>
      <span className="sr-only">
        {player.connected ? t('Online') : t('Reconnecting')}
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
  colorPickerSettings,
  onColorPickerSettings,
  patternRaceSettings,
  onPatternRaceSettings,
  minesweeperSettings,
  onMinesweeperSettings,
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
  const { t } = useLanguage();
  const self = players.find((player) => player.id === selfId);
  const selectedActivity = activities.find(
    (activity) => activity.id === self?.selectedActivity,
  );
  const [enteredActivityId, setEnteredActivityId] = useState<ActivityId | null>(
    null,
  );
  const [area, setArea] = useState<LobbyArea | null>(null);
  const [walkingArea, setWalkingArea] = useState<LobbyArea | null>(null);
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

  function enterArea(nextArea: LobbyArea) {
    setWalkingArea(nextArea);
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    window.setTimeout(
      () => {
        setWalkingArea(null);
        if (nextArea === 'photo-booth') {
          setEnteredActivityId(null);
          onSelectActivity('photo-booth');
        } else {
          setArea(nextArea);
        }
      },
      reducedMotion ? 0 : WALK_DURATION_MS,
    );
  }

  function leaveGameEntry() {
    if (!selectedActivity) return;
    onExitActivity(selectedActivity.id);
    setEnteredActivityId(null);
    setArea(selectedActivity.id === 'photo-booth' ? null : 'arcade');
  }

  return (
    <section
      className="lobby-shell"
      aria-label={
        area
          ? t('{0} menu', [t(area === 'arcade' ? 'Arcade' : 'Board Games')])
          : selectedActivity || startedActivity
          ? t('{0} activity', [
              t((selectedActivity ?? startedActivity)?.name ?? ''),
            ])
          : undefined
      }
      aria-labelledby={
        selectedActivity || startedActivity || area ? undefined : 'lobby-title'
      }
    >
      {!showActivityEntry && !startedActivity && !area && (
        <header className="lobby-toolbar">
          <div>
            <p className="pixel-kicker">{t('Your shared place')}</p>
            <h1 id="lobby-title" className="font-heading text-xl sm:text-2xl">
              {t('Room')} {roomCode}
            </h1>
          </div>
          <div className="lobby-actions">
            <PixelButton type="button" onClick={onCopyRoomCode}>
              {copied ? <Check size={17} /> : <Copy size={17} />}
              {copied ? t('Copied') : t('Copy code')}
            </PixelButton>
            <PixelButton type="button" onClick={onLeave}>
              <LogOut size={17} />
              {t('Leave')}
            </PixelButton>
          </div>
        </header>
      )}
      {status === 'reconnecting' && (
        <output className="lobby-alert">
          {t('Connection lost. Holding your place…')}
        </output>
      )}
      {error && (
        <div className="lobby-error" role="alert">
          <span>{t(error)}</span>
          <button
            type="button"
            aria-label={t('Dismiss error')}
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
          colorPickerSettings={colorPickerSettings}
          onColorPickerSettings={onColorPickerSettings}
          patternRaceSettings={patternRaceSettings}
          onPatternRaceSettings={onPatternRaceSettings}
          minesweeperSettings={minesweeperSettings}
          onMinesweeperSettings={onMinesweeperSettings}
          onReady={(ready) => onSetReady(selectedActivity.id, ready)}
          onExit={leaveGameEntry}
        />
      ) : area ? (
        <div className="area-menu">
          <div className="area-menu-heading">
            <PixelButton
              type="button"
              disabled={status !== 'connected'}
              onClick={() => setArea(null)}
            >
              <ArrowLeft size={17} />
              {t('Back to lobby')}
            </PixelButton>
            <div>
              <p className="pixel-kicker">{t('Choose what to play')}</p>
              <h1 className="font-heading">
                {t(area === 'arcade' ? 'Arcade' : 'Board Games')}
              </h1>
            </div>
          </div>
          {area === 'arcade' ? (
            <div className="area-menu-grid">
              {activities
                .filter((activity) => activity.id !== 'photo-booth')
                .map((activity) => (
                  <button
                    className={`arcade-station area-menu-card arcade-station--${activity.tone}`}
                    key={activity.id}
                    type="button"
                    aria-label={t('{0}: {1}', [
                      t(activity.name),
                      t(activity.detail),
                    ])}
                    disabled={status !== 'connected' || Boolean(activeActivity)}
                    onClick={() => {
                      setEnteredActivityId(null);
                      onSelectActivity(activity.id);
                    }}
                  >
                    <span className="station-screen" aria-hidden="true">
                      <i />
                    </span>
                    <span className="station-copy">
                      <strong>{t(activity.name)}</strong>
                      <small>{t(activity.detail)}</small>
                    </span>
                  </button>
                ))}
            </div>
          ) : (
            <div className="area-menu-coming-soon pixel-panel">
              <p className="pixel-kicker">{t('Coming soon')}</p>
              <h2>{t('Board game nights are on the way.')}</h2>
              <p>{t('Save a seat on the couch.')}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="arcade-room" aria-label={t('Choose an area')}>
          <Image
            className="arcade-room-art"
            src="/images/cozy-area-lobby.png"
            alt=""
            width={1536}
            height={1024}
            priority
          />
          <div className="station-grid">
            {lobbyAreas.map((lobbyArea) => {
              const count = players.filter((player) =>
                lobbyArea.id === 'photo-booth'
                  ? player.selectedActivity === 'photo-booth'
                  : lobbyArea.id === 'arcade'
                    ? player.selectedActivity &&
                      player.selectedActivity !== 'photo-booth'
                    : false,
              ).length;
              const selected = walkingArea === lobbyArea.id;
              return (
                <button
                  className={`arcade-station area-station area-station--${lobbyArea.id} arcade-station--${lobbyArea.tone} ${selected ? 'is-selected' : ''}`}
                  key={lobbyArea.id}
                  type="button"
                  disabled={
                    status !== 'connected' ||
                    Boolean(activeActivity) ||
                    Boolean(walkingArea)
                  }
                  aria-pressed={selected}
                  onClick={() => enterArea(lobbyArea.id)}
                >
                  <span className="station-screen" aria-hidden="true">
                    <i />
                  </span>
                  <span className="station-copy">
                    <strong>{t(lobbyArea.name)}</strong>
                    <small>{t(lobbyArea.detail)}</small>
                  </span>
                  <span
                    className="station-count"
                    aria-label={t('{0} players here', [count])}
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
              isWalking={
                player.id === selfId && (isWalking || Boolean(walkingArea))
              }
              slot={index}
              localArea={player.id === selfId ? walkingArea : null}
            />
          ))}
          {players.length < 2 && (
            <div className="empty-player-slot">
              <span className="empty-avatar" aria-hidden="true">
                ?
              </span>
              <span>{t('Waiting for player two')}</span>
            </div>
          )}
          <p className="arcade-hint" aria-live="polite">
            {walkingArea
              ? t('Walking to {0}…', [
                  t(
                    lobbyAreas.find((lobbyArea) => lobbyArea.id === walkingArea)
                      ?.name ?? '',
                  ),
                ])
              : isWalking && selectedActivity
                ? t('Walking to {0}…', [t(selectedActivity.name)])
                : t('Choose an area to walk over')}
          </p>

          {startedActivity ? (
            <output className="activity-started-panel">
              <p className="pixel-kicker">
                {startedActivity.id === 'minesweeper'
                  ? t('Round in progress')
                  : t('Both ready!')}
              </p>
              <h2>{t(startedActivity.name)}</h2>
              <p>
                {startedActivity.id === 'photo-booth'
                  ? t('Waiting for both of you to reconnect to the booth…')
                  : startedActivity.id === 'minesweeper'
                    ? t(
                        'Waiting for the previous round to return to setup. You can join the next round.',
                      )
                    : t('Your game setup is ready. Gameplay is coming next.')}
              </p>
              {self?.selectedActivity === startedActivity.id && (
                <PixelButton
                  disabled={status !== 'connected'}
                  onClick={() => onExitActivity(startedActivity.id)}
                >
                  {t('Back to lobby')}
                </PixelButton>
              )}
            </output>
          ) : null}
        </div>
      )}
    </section>
  );
}
