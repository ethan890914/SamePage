export const frameIds = ['classic', 'midnight', 'hearts', 'arcade'] as const;
export type FrameId = (typeof frameIds)[number];
export type BoothState = {
  instanceId: string;
  frame: FrameId;
  leftId: string;
  readyIds: string[];
  takeId: string | null;
  startsAt: number | null;
  autoStartAt: number | null;
};
export type BoothCommand =
  | { kind: 'sync' }
  | { kind: 'frame'; frame: FrameId }
  | { kind: 'swap' }
  | { kind: 'ready'; ready: boolean }
  | { kind: 'start' }
  | { kind: 'reset' }
  | {
      kind: 'signal';
      targetId: string;
      signal: {
        type: 'offer' | 'answer' | 'candidate' | 'hello' | 'restart';
        value: string;
      };
    };

export function isBoothCommand(value: unknown): value is BoothCommand {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const only = (...keys: string[]) =>
    Object.keys(v).every((k) => ['kind', ...keys].includes(k));
  switch (v.kind) {
    case 'sync':
    case 'swap':
    case 'start':
    case 'reset':
      return only();
    case 'frame':
      return only('frame') && frameIds.includes(v.frame as FrameId);
    case 'ready':
      return only('ready') && typeof v.ready === 'boolean';
    case 'signal': {
      if (
        !only('targetId', 'signal') ||
        typeof v.targetId !== 'string' ||
        v.targetId.length > 80 ||
        !v.signal ||
        typeof v.signal !== 'object'
      )
        return false;
      const s = v.signal as Record<string, unknown>;
      return (
        Object.keys(s).every((k) => ['type', 'value'].includes(k)) &&
        ['offer', 'answer', 'candidate', 'hello', 'restart'].includes(
          String(s.type),
        ) &&
        typeof s.value === 'string' &&
        s.value.length <= 6500
      );
    }
    default:
      return false;
  }
}

export const SHOT_INTERVAL = 11_000;
export const COUNTDOWN_MS = 10_000;
export const AUTO_START_MS = 3000;
export function shotTime(startsAt: number, index: number) {
  return startsAt + COUNTDOWN_MS + index * SHOT_INTERVAL;
}
export const TAKE_DURATION_MS = shotTime(0, 3) + 1000;
