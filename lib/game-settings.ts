export type ConvergeSettings = {
  timeLimitSeconds: number;
  mode: 'unlimited' | 'limited';
  maxRounds: number;
};

export const DEFAULT_CONVERGE_SETTINGS: ConvergeSettings = {
  timeLimitSeconds: 10,
  mode: 'unlimited',
  maxRounds: 10,
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
