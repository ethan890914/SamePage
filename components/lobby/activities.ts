import type { ActivityId } from '@/lib/protocol';

export type LobbyActivity = {
  id: ActivityId;
  name: string;
  detail: string;
  tone: 'pink' | 'cyan' | 'yellow';
};

export const activities: LobbyActivity[] = [
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
];
