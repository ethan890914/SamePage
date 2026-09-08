import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import { PixelButton } from '@/components/pixel/pixel-button';
import { PixelPanel } from '@/components/pixel/pixel-panel';
import type { PlayerView } from '@/lib/protocol';
import type { ConvergeSettings } from '@/lib/game-settings';
import { gameEntryEnglish as copy } from '@/lib/i18n/game-entry';

function SettingStepper<T extends string | number>({
  label,
  options,
  value,
  format,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  format: (value: T) => string;
  onChange: (value: T) => void;
}) {
  const index = Math.max(0, options.indexOf(value));
  const select = (offset: number) => {
    const nextIndex = (index + offset + options.length) % options.length;
    onChange(options[nextIndex]);
  };

  return (
    <div className="game-setting-stepper" aria-label={label}>
      <button
        type="button"
        onClick={() => select(-1)}
        aria-label={`Previous ${label}`}
      >
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <output aria-live="polite">{format(value)}</output>
      <button
        type="button"
        onClick={() => select(1)}
        aria-label={`Next ${label}`}
      >
        <ChevronRight size={20} aria-hidden="true" />
      </button>
    </div>
  );
}

export function GameEntry({
  activityId,
  players,
  selfId,
  status,
  settings,
  onSettings,
  onReady,
  onExit,
}: {
  activityId: 'converge' | 'pattern-race';
  players: PlayerView[];
  selfId: string;
  status: string;
  settings: ConvergeSettings;
  onSettings: (settings: ConvergeSettings) => void;
  onReady: (ready: boolean) => void;
  onExit: () => void;
}) {
  const game = copy.games[activityId];
  const self = players.find((player) => player.id === selfId);
  const connected = status === 'connected';
  const bothHere =
    players.length === 2 &&
    players.every(
      (player) => player.selectedActivity === activityId && player.connected,
    );
  return (
    <section
      className={`game-entry game-entry--${activityId}`}
      aria-labelledby="game-entry-title"
    >
      <header className="game-entry-header">
        <div className="game-entry-heading">
          <p className="pixel-kicker">{copy.eyebrow}</p>
          <h2
            id="game-entry-title"
            className="font-heading text-3xl sm:text-4xl"
          >
            {activityId === 'converge' ? 'Converge' : 'Pattern Race'}
          </h2>
          <p className="mt-3 text-muted-foreground">{game.description}</p>
        </div>
        <div className="game-entry-controls">
          <div className="game-entry-players" aria-live="polite">
            {players.map((player) => {
              const here = player.selectedActivity === activityId;
              return (
                <div
                  className={`game-entry-player ${here ? 'is-here' : ''} ${here && player.ready ? 'is-ready' : ''}`}
                  key={player.id}
                >
                  <span
                    className={`game-entry-avatar avatar-art ${player.avatarId}`}
                    aria-hidden="true"
                  />
                  <span>
                    <strong>
                      {player.name}
                      {player.id === selfId ? copy.you : ''}
                    </strong>
                    <small>
                      {!player.connected
                        ? copy.reconnecting
                        : !here
                          ? copy.away
                          : player.ready
                            ? copy.readyStatus
                            : copy.preparing}
                    </small>
                  </span>
                  {here && player.ready && (
                    <Check size={16} aria-hidden="true" />
                  )}
                </div>
              );
            })}
            {players.length < 2 && (
              <span className="game-entry-empty">{copy.empty}</span>
            )}
          </div>
          <div className="game-entry-actions">
            <PixelButton
              className="game-entry-ready-button"
              variant={self?.ready ? 'secondary' : 'primary'}
              disabled={!connected}
              onClick={() => onReady(!self?.ready)}
            >
              {self?.ready ? copy.cancelReady : copy.ready}
            </PixelButton>
            <PixelButton
              className="game-entry-back-button"
              onClick={onExit}
              disabled={!connected}
            >
              <ArrowLeft size={16} />
              {copy.exit}
            </PixelButton>
          </div>
          <output className="game-entry-status">
            {!connected
              ? copy.connectionLost
              : bothHere
                ? copy.bothHere
                : copy.waiting}
          </output>
        </div>
      </header>
      <div className="game-entry-grid">
        <PixelPanel title={copy.rules}>
          <ol className="game-entry-rules">
            {game.rules.map((rule, index) => (
              <li key={rule}>
                <span aria-hidden="true">{index + 1}</span>
                <p>{rule}</p>
              </li>
            ))}
          </ol>
        </PixelPanel>
        <PixelPanel title={copy.settings}>
          {activityId === 'converge' ? (
            <fieldset
              disabled={!connected || Boolean(self?.ready)}
              className="game-entry-settings"
            >
              <legend className="sr-only">{copy.settings}</legend>
              <span className="game-setting-label">{copy.timeLimit}</span>
              <SettingStepper
                label={copy.timeLimit}
                options={[10, 15, 20, 30, 60]}
                value={settings.timeLimitSeconds}
                format={copy.seconds}
                onChange={(timeLimitSeconds) =>
                  onSettings({ ...settings, timeLimitSeconds })
                }
              />
              <p id="timer-hint">{copy.timerHint}</p>
              <span className="game-setting-label">{copy.mode}</span>
              <SettingStepper
                label={copy.mode}
                options={['unlimited', 'limited'] as const}
                value={settings.mode}
                format={(mode) =>
                  mode === 'unlimited' ? copy.unlimited : copy.limited
                }
                onChange={(mode) => onSettings({ ...settings, mode })}
              />
              <p>
                {settings.mode === 'unlimited'
                  ? copy.unlimitedHint
                  : copy.limitedHint}
              </p>
              {settings.mode === 'limited' && (
                <>
                  <span className="game-setting-label">{copy.maxRounds}</span>
                  <SettingStepper
                    label={copy.maxRounds}
                    options={[3, 5, 10, 15, 20]}
                    value={settings.maxRounds}
                    format={copy.rounds}
                    onChange={(maxRounds) =>
                      onSettings({ ...settings, maxRounds })
                    }
                  />
                </>
              )}
              <p className="game-settings-note">
                <SlidersHorizontal size={16} aria-hidden="true" />
                {copy.sharedSettings}
              </p>
            </fieldset>
          ) : (
            <p className="text-muted-foreground">{copy.defaultSettings}</p>
          )}
        </PixelPanel>
      </div>
    </section>
  );
}
