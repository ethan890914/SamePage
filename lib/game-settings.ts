export type MinesweeperSettings = {
  rows: number;
  columns: number;
  difficulty: 'easy' | 'medium' | 'hard';
  startingPlayer: 'player1' | 'player2' | 'random';
};

export const DEFAULT_MINESWEEPER_SETTINGS: MinesweeperSettings = {
  rows: 9,
  columns: 9,
  difficulty: 'easy',
  startingPlayer: 'random',
};

export const MINESWEEPER_DENSITY = {
  easy: 0.125,
  medium: 0.16,
  hard: 0.2,
} as const;

export function minesweeperMineCount(settings: MinesweeperSettings) {
  return Math.round(
    settings.rows * settings.columns * MINESWEEPER_DENSITY[settings.difficulty],
  );
}

export function isMinesweeperSettings(
  value: unknown,
): value is MinesweeperSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const settings = value as Record<string, unknown>;
  return (
    Object.keys(settings).length === 4 &&
    Number.isInteger(settings.rows) &&
    (settings.rows as number) >= 8 &&
    (settings.rows as number) <= 30 &&
    Number.isInteger(settings.columns) &&
    (settings.columns as number) >= 8 &&
    (settings.columns as number) <= 30 &&
    ['easy', 'medium', 'hard'].includes(settings.difficulty as string) &&
    ['player1', 'player2', 'random'].includes(settings.startingPlayer as string)
  );
}

export type ConvergeSettings = {
  timeLimitSeconds: number;
  mode: 'unlimited' | 'limited';
  maxRounds: number;
};

export type PatternRaceSettings = {
  mode: 'time' | 'problems';
  timeLimitMinutes: number;
  problemCount: number;
  wordLengthMode: 'limited' | 'unlimited';
};

export const DEFAULT_CONVERGE_SETTINGS: ConvergeSettings = {
  timeLimitSeconds: 10,
  mode: 'unlimited',
  maxRounds: 10,
};

export const DEFAULT_PATTERN_RACE_SETTINGS: PatternRaceSettings = {
  mode: 'time',
  timeLimitMinutes: 5,
  problemCount: 5,
  wordLengthMode: 'limited',
};

export function isConvergeSettings(value: unknown): value is ConvergeSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const settings = value as Record<string, unknown>;
  return (
    Object.keys(settings).length === 3 &&
    [10, 15, 20, 30, 60].includes(settings.timeLimitSeconds as number) &&
    (settings.mode === 'unlimited' || settings.mode === 'limited') &&
    [3, 5, 10, 15, 20].includes(settings.maxRounds as number)
  );
}

export function isPatternRaceSettings(
  value: unknown,
): value is PatternRaceSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const settings = value as Record<string, unknown>;
  return (
    Object.keys(settings).length === 4 &&
    (settings.mode === 'time' || settings.mode === 'problems') &&
    [3, 5, 10].includes(settings.timeLimitMinutes as number) &&
    [3, 5, 7, 9, 11].includes(settings.problemCount as number) &&
    (settings.wordLengthMode === 'limited' ||
      settings.wordLengthMode === 'unlimited')
  );
}
