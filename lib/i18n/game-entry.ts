// Keep interface copy separate from game rules and future word-language modules.
export const gameEntryEnglish = {
  eyebrow: 'Before you play',
  rules: 'How to play',
  settings: 'Game settings',
  sharedSettings:
    'Settings are shared. Either player can change them; changes reset both ready checks.',
  timeLimit: 'Time per round',
  seconds: (value: number) => `${value} seconds`,
  timerHint:
    'Your first word has no timer. This limit applies to later rounds.',
  mode: 'Game mode',
  unlimited: 'Until we match',
  limited: 'Round challenge',
  maxRounds: 'Round limit',
  rounds: (value: number) => `${value} rounds`,
  unlimitedHint: 'Keep going until you find the same word.',
  limitedHint:
    'Find the same word before your rounds run out. Missed timers count as an attempt.',
  ready: 'I’m ready',
  cancelReady: 'Cancel ready',
  exit: 'Back to arcade',
  you: ' · you',
  readyStatus: 'Ready!',
  preparing: 'Getting ready',
  away: 'In the arcade',
  reconnecting: 'Reconnecting…',
  empty: 'Waiting for player two',
  bothHere: 'The game starts when you’re both ready.',
  waiting: 'Your partner needs to choose this game in the arcade.',
  connectionLost: 'Reconnecting. Your settings are saved.',
  defaultSettings: 'This game has no adjustable settings yet.',
  games: {
    converge: {
      description:
        'Two minds. One word. Find your way to the same answer together.',
      rules: [
        'Each choose a starting word in private.',
        'Reveal your words together. The same word wins!',
        'If they differ, think of a word that connects the pair and submit before time runs out.',
        'Keep following the new pair until you meet on the same word.',
      ],
    },
    'pattern-race': {
      description: 'A shared word puzzle. A friendly race to the answer.',
      rules: [
        'You both see a first letter, last letter, and word length.',
        'Think of a real word that fits all three clues.',
        'The first player to submit a valid word wins the round.',
      ],
    },
  },
};
