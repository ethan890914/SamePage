import type { ActivityId } from '@/lib/protocol';

export type LobbyActivity = {
  id: ActivityId;
  name: string;
  detail: string;
  tone: 'pink' | 'cyan' | 'yellow' | 'green';
};

export const activities: LobbyActivity[] = [
  { id: 'color-picker', name: 'Color Picker', detail: 'Remember and match the color', tone: 'yellow' },
  {
    id: 'converge',
    name: 'Converge',
    detail: 'Find the same word',
    tone: 'pink',
  },
  {
    id: 'pattern-race',
    name: 'Pattern Race',
    detail: 'Think fast, type faster',
    tone: 'cyan',
  },
  {
    id: 'photo-booth',
    name: 'Photo Booth',
    detail: 'Make a tiny memory',
    tone: 'yellow',
  },
  {
    id: 'minesweeper',
    name: 'Minesweeper',
    detail: 'Take turns, watch your step',
    tone: 'green',
  },
];
