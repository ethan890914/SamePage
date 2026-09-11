import { useLanguage } from '@/lib/i18n/provider';
import { ActivityEntry } from '@/components/games/activity-entry';
import { MinesweeperSettingsFields } from '@/components/games/minesweeper-settings';
import { Check, SlidersHorizontal } from 'lucide-react';
import { SettingStepper } from '@/components/pixel/setting-stepper';
import { PixelButton } from '@/components/pixel/pixel-button';
import { PixelPanel } from '@/components/pixel/pixel-panel';
import type { PlayerView } from '@/lib/protocol';
import type { ReactNode } from 'react';
import type {
  ConvergeSettings,
  PatternRaceSettings,
  MinesweeperSettings,
  ColorPickerSettings,
} from '@/lib/game-settings';
import { gameEntryEnglish } from '@/lib/i18n/game-entry';
import { gameEntryTraditionalChinese } from '@/lib/i18n/zh-TW';

export function GameEntry({
  activityId,
  players,
  selfId,
  status,
  settings,
  onSettings,
  patternRaceSettings,
  onPatternRaceSettings,
  minesweeperSettings,
  onMinesweeperSettings,
  colorPickerSettings,
  onColorPickerSettings,
  onReady,
  onExit,
  camera,
  cameraReady = true,
  cameraBusy = false,
  onEnableCamera,
  countdownSeconds = 10,
  onCountdown,
}: {
  activityId: 'converge' | 'pattern-race' | 'photo-booth' | 'minesweeper' | 'color-picker';
  camera?: ReactNode;
  cameraReady?: boolean;
  cameraBusy?: boolean;
  onEnableCamera?: () => void;
  countdownSeconds?: number;
  onCountdown?: (seconds: number) => void;
  players: PlayerView[];
  selfId: string;
  status: string;
  settings: ConvergeSettings;
  onSettings: (settings: ConvergeSettings) => void;
  patternRaceSettings: PatternRaceSettings;
  onPatternRaceSettings: (settings: PatternRaceSettings) => void;
  minesweeperSettings: MinesweeperSettings;
  onMinesweeperSettings: (settings: MinesweeperSettings) => void;
  colorPickerSettings: ColorPickerSettings;
  onColorPickerSettings: (settings: ColorPickerSettings) => void;
  onReady: (ready: boolean) => void;
  onExit: () => void;
}) {
  const { t, locale } = useLanguage();
  const copy =
    locale === 'zh-TW' ? gameEntryTraditionalChinese : gameEntryEnglish;
  const game =
    activityId === 'photo-booth'
      ? {
          description: t('Four photos, one shared strip.'),
          rules: [
            t('Enable your camera and check your preview.'),
            t('Choose a countdown, then both get ready to enter the booth.'),
            t(
              'Pick a frame, switch sides, and pose for four photos. Download your strip with the original or shared background.',
            ),
          ],
        }
      : activityId === 'minesweeper'
        ? {
            description: t('One board. Take turns. Watch your step.'),
            rules: [
              t(
                'Take turns revealing one tile. Numbers count mines in the eight neighboring tiles; empty areas open automatically as one turn.',
              ),
              t(
                'Hit a mine and you lose. Reveal the final safe tile and you win. The first reveal always opens a safe area.',
              ),
              t(
                'Flag suspected mines on your turn without spending it. Flags are shared notes and may be wrong.',
              ),
              t(
                'Activate an open number to reveal its other neighbors when adjacent flags match. Incorrect flags can cause an explosion.',
              ),
            ],
          }
      : activityId === 'color-picker'
        ? { description: t('Remember the color. Rebuild it from memory.'), rules: [t('Study the target color before it disappears.'), t('Use the hue strip and color board to recreate it, then lock in your guess.'), t('When time runs out, your current color locks automatically. Every round starts at white.'), t('The closest color scores higher. Highest total after all rounds wins.')] }
        : copy.games[activityId];
  const self = players.find((player) => player.id === selfId);
  const connected = status === 'connected';
  const bothHere =
    players.length === 2 &&
    players.every(
      (player) => player.selectedActivity === activityId && player.connected,
    );
  const actions = (
    <div className="game-entry-actions">
      <PixelButton
        className="game-entry-ready-button"
        variant={self?.ready ? 'secondary' : 'primary'}
        disabled={
          !connected ||
          (activityId === 'photo-booth'
            ? cameraBusy
            : !cameraReady && !self?.ready)
        }
        aria-pressed={
          activityId === 'photo-booth' && cameraReady
            ? Boolean(self?.ready)
            : undefined
        }
        onClick={() => {
          if (activityId === 'photo-booth' && !cameraReady) onEnableCamera?.();
          else onReady(!self?.ready);
        }}
      >
        {activityId === 'photo-booth'
          ? cameraBusy
            ? t('Opening camera…')
            : !cameraReady
              ? t('Enable camera')
              : self?.ready
                ? copy.cancelReady
                : copy.ready
          : self?.ready
            ? copy.cancelReady
            : copy.ready}
      </PixelButton>
    </div>
  );
  return (
    <ActivityEntry
      variant={activityId}
      title={
        activityId === 'converge'
          ? t('Converge')
          : activityId === 'minesweeper'
            ? t('Minesweeper')
            : activityId === 'photo-booth'
              ? t('Photo Booth')
              : activityId === 'color-picker'
                ? t('Color Picker')
              : t('Pattern Race')
      }
      subtitle={game.description}
      eyebrow={copy.eyebrow}
      players={
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
                {here && player.ready && <Check size={16} aria-hidden="true" />}
              </div>
            );
          })}
          {players.length < 2 && (
            <span className="game-entry-empty">{copy.empty}</span>
          )}
        </div>
      }
      status={
        !connected
          ? copy.connectionLost
          : bothHere
            ? copy.bothHere
            : copy.waiting
      }
      actions={actions}
      onExit={onExit}
      exitDisabled={!connected}
    >
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
        {activityId === 'color-picker' ? (
          <fieldset disabled={!connected || Boolean(self?.ready)} className="game-entry-settings">
            <legend className="sr-only">{copy.settings}</legend>
            <span className="game-setting-label">{t('Rounds')}</span>
            <SettingStepper label={t('Rounds')} options={[3, 5, 7, 10]} value={colorPickerSettings.rounds} format={(value) => t('{0} rounds', [value])} onChange={(rounds) => onColorPickerSettings({ ...colorPickerSettings, rounds })} />
            <span className="game-setting-label">{t('Memorize time')}</span>
            <SettingStepper label={t('Memorize time')} options={[3, 4, 5]} value={colorPickerSettings.memorizeSeconds} format={(value) => t('{0} sec', [value])} onChange={(memorizeSeconds) => onColorPickerSettings({ ...colorPickerSettings, memorizeSeconds })} />
            <span className="game-setting-label">{t('Pick time')}</span>
            <SettingStepper label={t('Pick time')} options={[15, 20, 30]} value={colorPickerSettings.pickSeconds} format={(value) => t('{0} sec', [value])} onChange={(pickSeconds) => onColorPickerSettings({ ...colorPickerSettings, pickSeconds })} />
          </fieldset>
        ) : activityId === 'minesweeper' ? (
          <MinesweeperSettingsFields
            key={`${minesweeperSettings.rows}x${minesweeperSettings.columns}`}
            settings={minesweeperSettings}
            players={players}
            disabled={!connected || Boolean(self?.ready)}
            onChange={onMinesweeperSettings}
          />
        ) : activityId === 'photo-booth' ? (
          <div className="game-entry-settings">
            <fieldset disabled={!connected || Boolean(self?.ready)}>
              <legend className="game-setting-label">
                {t('Countdown per photo')}
              </legend>
              <SettingStepper
                label={t('countdown')}
                options={[10, 12, 15]}
                value={countdownSeconds}
                format={(seconds) => t('{0} sec', [seconds])}
                onChange={(seconds) => onCountdown?.(seconds)}
              />
            </fieldset>
            <p className="game-settings-note">
              {t(
                'Shared by both players. Changing the countdown resets readiness.',
              )}
            </p>
            {camera}
          </div>
        ) : activityId === 'converge' ? (
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
          <fieldset
            disabled={!connected || Boolean(self?.ready)}
            className="game-entry-settings"
          >
            <legend className="sr-only">{copy.settings}</legend>
            <span className="game-setting-label">{copy.raceMode}</span>
            <SettingStepper
              label={copy.raceMode}
              options={['time', 'problems'] as const}
              value={patternRaceSettings.mode}
              format={(mode) =>
                mode === 'time' ? copy.raceTime : copy.problemCount
              }
              onChange={(mode) =>
                onPatternRaceSettings({ ...patternRaceSettings, mode })
              }
            />
            {patternRaceSettings.mode === 'time' ? (
              <>
                <span className="game-setting-label">{copy.raceTime}</span>
                <SettingStepper
                  label={copy.raceTime}
                  options={[3, 5, 10]}
                  value={patternRaceSettings.timeLimitMinutes}
                  format={copy.minutes}
                  onChange={(timeLimitMinutes) =>
                    onPatternRaceSettings({
                      ...patternRaceSettings,
                      timeLimitMinutes,
                    })
                  }
                />
                <p>{copy.raceTimeHint}</p>
              </>
            ) : (
              <>
                <span className="game-setting-label">{copy.problemCount}</span>
                <SettingStepper
                  label={copy.problemCount}
                  options={[3, 5, 7, 9, 11]}
                  value={patternRaceSettings.problemCount}
                  format={copy.problems}
                  onChange={(problemCount) =>
                    onPatternRaceSettings({
                      ...patternRaceSettings,
                      problemCount,
                    })
                  }
                />
                <p>{copy.problemCountHint}</p>
              </>
            )}
            <span className="game-setting-label">{copy.wordLength}</span>
            <SettingStepper
              label={copy.wordLength}
              options={['limited', 'unlimited'] as const}
              value={patternRaceSettings.wordLengthMode}
              format={(mode) =>
                mode === 'limited'
                  ? copy.wordLengthLimited
                  : copy.wordLengthUnlimited
              }
              onChange={(wordLengthMode) =>
                onPatternRaceSettings({
                  ...patternRaceSettings,
                  wordLengthMode,
                })
              }
            />
            <p>
              {patternRaceSettings.wordLengthMode === 'limited'
                ? copy.wordLengthLimitedHint
                : copy.wordLengthUnlimitedHint}
            </p>
            <p className="game-settings-note">
              <SlidersHorizontal size={16} aria-hidden="true" />
              {copy.sharedSettings}
            </p>
          </fieldset>
        )}
      </PixelPanel>
    </ActivityEntry>
  );
}
