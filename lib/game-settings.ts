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
