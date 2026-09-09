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
  raceMode: 'Game mode',
  raceTime: 'Total game time',
  minutes: (value: number) => `${value} min`,
  raceTimeHint: 'Score as many problems as you can before time runs out.',
  problemCount: 'First to X points',
  problems: (value: number) => `${value} points`,
  problemCountHint:
    'Each correct answer earns one point. First to the target wins.',
  wordLength: 'Word length clue',
  wordLengthLimited: 'Limited',
  wordLengthUnlimited: 'Any length',
  wordLengthLimitedHint:
    'The pattern shows every letter slot, such as A _ _ _ E.',
  wordLengthUnlimitedHint:
    'The pattern shows only the first and last letters. Any word length is accepted.',
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
      description: 'A shared timed word puzzle. Think fast, type faster.',
      rules: [
        'You both see the same first and last letters. Limited mode also shows the number of blanks.',
        'Type a real word that starts and ends with the letters shown.',
        'The first valid answer earns one point. Score the most before time expires, or be first to the point target. Questions never repeat within a game.',
      ],
    },
  },
};
