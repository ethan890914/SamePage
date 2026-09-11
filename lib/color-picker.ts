import type { ColorPickerSettings } from './game-settings';

export type RGB = { r: number; g: number; b: number };
export type ColorPickerResult = {
  round: number;
  target: RGB;
  guesses: Record<string, RGB>;
  drafts: Record<string, RGB>;
  scores: Record<string, number>;
  winnerId: string | null;
};
export type ColorPickerState = {
  instanceId: string;
  settings: ColorPickerSettings;
  playerIds: string[];
  phase: 'memorize' | 'pick' | 'reveal' | 'finished';
  round: number;
  target: RGB;
  deadline: number | null;
  guesses: Record<string, RGB>;
  totals: Record<string, number>;
  history: ColorPickerResult[];
  readyIds: string[];
};
export type ColorPickerPublicState = Omit<ColorPickerState, 'guesses' | 'drafts'> & {
  submittedIds: string[];
};
export type ColorPickerCommand =
  | { kind: 'sync' }
  | { kind: 'submit'; round: number; color: RGB }
  | { kind: 'preview'; round: number; color: RGB }
  | { kind: 'continue' }
  | { kind: 'return_to_setup' };

export function isRGB(value: unknown): value is RGB {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const color = value as Record<string, unknown>;
  return Object.keys(color).length === 3 && ['r', 'g', 'b'].every((key) =>
    Number.isInteger(color[key]) && (color[key] as number) >= 0 && (color[key] as number) <= 255,
  );
}
export function isColorPickerCommand(value: unknown): value is ColorPickerCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const command = value as Record<string, unknown>;
  if (command.kind === 'sync' || command.kind === 'continue' || command.kind === 'return_to_setup')
    return Object.keys(command).length === 1;
  return (command.kind === 'submit' || command.kind === 'preview') && Object.keys(command).length === 3 &&
    Number.isInteger(command.round) && (command.round as number) >= 1 && isRGB(command.color);
}
export function colorScore(target: RGB, guess: RGB) {
  const distance = Math.hypot(guess.r - target.r, guess.g - target.g, guess.b - target.b);
  return Math.round(Math.max(0, 100 * (1 - distance / (255 * Math.sqrt(3)))) * 10) / 10;
}
export function randomTarget(): RGB {
  return { r: 24 + Math.floor(Math.random() * 208), g: 24 + Math.floor(Math.random() * 208), b: 24 + Math.floor(Math.random() * 208) };
}
export function publicColorPickerState(state: ColorPickerState): ColorPickerPublicState {
  const { guesses, drafts: _drafts, target, ...rest } = state;
  return {
    ...rest,
    target: state.phase === 'pick' ? { r: 0, g: 0, b: 0 } : target,
    submittedIds: Object.keys(guesses),
  };
}
