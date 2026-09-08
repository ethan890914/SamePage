import type { ConvergeSettings } from './game-settings';

export type ConvergeHistoryEntry = {
  round: number;
  words: [string, string] | null;
  matched: boolean;
  timedOut: boolean;
};

export type ConvergeState = {
  instanceId: string;
  settings: ConvergeSettings;
  phase: 'playing' | 'won' | 'lost';
  round: number;
  baseWords: [string, string] | null;
  submittedIds: string[];
  deadline: number | null;
  pausedRemainingMs: number | null;
  history: ConvergeHistoryEntry[];
  replayReadyIds: string[];
  submissions: Record<string, string>;
};

export type ConvergePublicState = Omit<ConvergeState, 'submissions'>;

export type ConvergeCommand =
  | { kind: 'sync' }
  | { kind: 'submit'; round: number; word: string }
  | { kind: 'return_to_setup' };

export function isConvergeCommand(value: unknown): value is ConvergeCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const command = value as Record<string, unknown>;
  const only = (...keys: string[]) =>
    Object.keys(command).every((key) => ['kind', ...keys].includes(key));
  if (command.kind === 'sync' || command.kind === 'return_to_setup')
    return only();
  return (
    command.kind === 'submit' &&
    only('round', 'word') &&
    Number.isInteger(command.round) &&
    (command.round as number) >= 1 &&
    typeof command.word === 'string' &&
    command.word === command.word.trim() &&
    command.word.length >= 1 &&
    command.word.length <= 40
  );
}

function inflectionForms(word: string) {
  const forms = new Set([word]);
  const irregular: Record<string, string> = {
    children: 'child',
    feet: 'foot',
    geese: 'goose',
    men: 'man',
    mice: 'mouse',
    people: 'person',
    ran: 'run',
    teeth: 'tooth',
    went: 'go',
    women: 'woman',
  };
  if (irregular[word]) forms.add(irregular[word]);
  if (word.length > 4 && word.endsWith('ies'))
    forms.add(`${word.slice(0, -3)}y`);
  if (word.length > 4 && /(ches|shes|xes|zes|ses|oes)$/.test(word))
    forms.add(word.slice(0, -2));
  if (word.length > 3 && word.endsWith('s') && !/(ss|us|is)$/.test(word))
    forms.add(word.slice(0, -1));
  if (word.length > 4 && word.endsWith('ied'))
    forms.add(`${word.slice(0, -3)}y`);
  if (word.length > 4 && word.endsWith('ed')) {
    const stem = word.slice(0, -2);
    forms.add(stem);
    forms.add(word.slice(0, -1));
    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) forms.add(stem.slice(0, -1));
  }
  if (word.length > 5 && word.endsWith('ing')) {
    const stem = word.slice(0, -3);
    forms.add(stem);
    forms.add(`${stem}e`);
    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) forms.add(stem.slice(0, -1));
  }
  return forms;
}

export function normalizeConvergeWord(word: string) {
  return word
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en-US');
}

export function convergeWordsMatch(left: string, right: string) {
  const leftForms = inflectionForms(normalizeConvergeWord(left));
  const rightForms = inflectionForms(normalizeConvergeWord(right));
  for (const form of leftForms) if (rightForms.has(form)) return true;
  return false;
}

export function publicConvergeState(state: ConvergeState): ConvergePublicState {
  const { submissions: _submissions, ...publicState } = state;
  return publicState;
}
