import {
  minesweeperMineCount,
  type MinesweeperSettings,
} from './game-settings';

export type MinesweeperCommand =
  | { kind: 'sync' }
  | { kind: 'return_to_setup'; round: number }
  | { kind: 'replay_ready'; round: number; ready: boolean }
  | {
      kind: 'reveal' | 'chord';
      round: number;
      turn: number;
      revision: number;
      cell: number;
    }
  | {
      kind: 'flag';
      round: number;
      turn: number;
      revision: number;
      cell: number;
      flagged: boolean;
    };

export type MinesweeperPublicState = {
  instanceId: string;
  settings: MinesweeperSettings;
  playerIds: [string, string];
  phase: 'playing' | 'finished';
  round: number;
  turn: number;
  revision: number;
  startingPlayerId: string;
  currentPlayerId: string;
  mineCount: number;
  safeRemaining: number;
  // null conceals both a tile's number and whether it contains a mine.
  cells: (number | null)[];
  revealed: boolean[];
  flags: boolean[];
  generated: boolean;
  lastAction: { playerId: string; cell: number; revealedCount: number } | null;
  explodedCell: number | null;
  winnerId: string | null;
  result: 'exploded' | 'cleared' | 'abandoned' | null;
  replayReadyIds: string[];
};

// This full board is persisted only in the Durable Object.
export type MinesweeperState = Omit<MinesweeperPublicState, 'cells'> & {
  board: number[] | null;
};

export function isMinesweeperCommand(
  value: unknown,
): value is MinesweeperCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const command = value as Record<string, unknown>;
  const only = (keys: string[]) =>
    Object.keys(command).every((key) => keys.includes(key));
  if (command.kind === 'sync') return only(['kind']);
  if (!Number.isSafeInteger(command.round) || (command.round as number) < 1)
    return false;
  if (command.kind === 'return_to_setup') return only(['kind', 'round']);
  if (command.kind === 'replay_ready')
    return (
      only(['kind', 'round', 'ready']) && typeof command.ready === 'boolean'
    );
  if (!['reveal', 'chord', 'flag'].includes(command.kind as string))
    return false;
  return (
    only([
      'kind',
      'round',
      'turn',
      'revision',
      'cell',
      ...(command.kind === 'flag' ? ['flagged'] : []),
    ]) &&
    Number.isSafeInteger(command.turn) &&
    (command.turn as number) >= 1 &&
    Number.isSafeInteger(command.revision) &&
    (command.revision as number) >= 0 &&
    Number.isInteger(command.cell) &&
    (command.cell as number) >= 0 &&
    (command.cell as number) < 900 &&
    (command.kind !== 'flag' || typeof command.flagged === 'boolean')
  );
}

function randomIndex(size: number) {
  // Rejection sampling avoids modulo bias when selecting a player or mine.
  const limit = Math.floor(0x100000000 / size) * size;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % size;
}

export function newMinesweeperState(
  instanceId: string,
  settings: MinesweeperSettings,
  playerIds: [string, string],
  round = 1,
): MinesweeperState {
  const starter =
    settings.startingPlayer === 'random'
      ? randomIndex(2)
      : settings.startingPlayer === 'player1'
        ? 0
        : 1;
  const size = settings.rows * settings.columns;
  const mineCount = minesweeperMineCount(settings);
  return {
    instanceId,
    settings: { ...settings },
    playerIds,
    phase: 'playing',
    round,
    turn: 1,
    revision: 0,
    startingPlayerId: playerIds[starter],
    currentPlayerId: playerIds[starter],
    mineCount,
    safeRemaining: size - mineCount,
    board: null,
    revealed: Array<boolean>(size).fill(false),
    flags: Array<boolean>(size).fill(false),
    generated: false,
    lastAction: null,
    explodedCell: null,
    winnerId: null,
    result: null,
    replayReadyIds: [],
  };
}

export function publicMinesweeperState(
  state: MinesweeperState,
): MinesweeperPublicState {
  const { board, ...visible } = state;
  return {
    ...visible,
    cells: state.revealed.map((revealed, cell) =>
      board && (revealed || state.phase === 'finished') ? board[cell] : null,
    ),
  };
}

function neighbors(cell: number, settings: MinesweeperSettings) {
  const row = Math.floor(cell / settings.columns);
  const column = cell % settings.columns;
  const result: number[] = [];
  for (
    let y = Math.max(0, row - 1);
    y <= Math.min(settings.rows - 1, row + 1);
    y++
  ) {
    for (
      let x = Math.max(0, column - 1);
      x <= Math.min(settings.columns - 1, column + 1);
      x++
    ) {
      const index = y * settings.columns + x;
      if (index !== cell) result.push(index);
    }
  }
  return result;
}

function generateBoard(state: MinesweeperState, opening: number) {
  const protectedCells = new Set([
    opening,
    ...neighbors(opening, state.settings),
  ]);
  const candidates = state.revealed
    .map((_, index) => index)
    .filter((index) => !protectedCells.has(index));
  const board = Array<number>(state.revealed.length).fill(0);
  for (let i = 0; i < state.mineCount; i++) {
    const choice = i + randomIndex(candidates.length - i);
    [candidates[i], candidates[choice]] = [candidates[choice], candidates[i]];
    board[candidates[i]] = -1;
  }
  for (const cell of candidates.slice(0, state.mineCount)) {
    for (const neighbor of neighbors(cell, state.settings)) {
      if (board[neighbor] !== -1) board[neighbor] += 1;
    }
  }
  state.board = board;
  state.generated = true;
}

export type MinesweeperMoveError =
  | 'stale_round'
  | 'not_your_turn'
  | 'invalid_move'
  | 'game_not_playing';

export function applyMinesweeperMove(
  state: MinesweeperState,
  playerId: string,
  command: Extract<MinesweeperCommand, { cell: number }>,
): MinesweeperMoveError | null {
  if (state.phase !== 'playing') return 'game_not_playing';
  if (
    command.round !== state.round ||
    command.turn !== state.turn ||
    command.revision !== state.revision
  )
    return 'stale_round';
  if (state.currentPlayerId !== playerId) return 'not_your_turn';
  if (command.cell >= state.revealed.length) return 'invalid_move';
  const cell = command.cell;
  if (command.kind === 'flag') {
    if (state.revealed[cell]) return 'invalid_move';
    state.flags[cell] = command.flagged;
    state.revision += 1;
    return null;
  }
  let targets: number[];
  if (command.kind === 'chord') {
    if (!state.board || !state.revealed[cell] || state.board[cell] <= 0)
      return 'invalid_move';
    const adjacent = neighbors(cell, state.settings);
    if (
      adjacent.filter((index) => state.flags[index]).length !==
      state.board[cell]
    )
      return 'invalid_move';
    targets = adjacent.filter(
      (index) => !state.flags[index] && !state.revealed[index],
    );
    if (!targets.length) return 'invalid_move';
  } else {
    if (state.revealed[cell] || state.flags[cell]) return 'invalid_move';
    if (!state.board) generateBoard(state, cell);
    targets = [cell];
  }
  const board = state.board!;
  // Resolve all potential explosions first; a chord can never win by clearing
  // its safe neighbors before opening an incorrectly flagged mine.
  const explosion = targets.find((index) => board[index] === -1);
  let revealedCount = 0;
  if (explosion !== undefined) {
    state.revealed[explosion] = true;
    state.explodedCell = explosion;
    state.phase = 'finished';
    state.result = 'exploded';
    state.winnerId = state.playerIds.find((id) => id !== playerId)!;
  } else {
    const pending = [...targets];
    while (pending.length) {
      const index = pending.pop()!;
      if (state.revealed[index] || state.flags[index] || board[index] === -1)
        continue;
      state.revealed[index] = true;
      revealedCount += 1;
      if (board[index] === 0) pending.push(...neighbors(index, state.settings));
    }
    state.safeRemaining -= revealedCount;
    if (state.safeRemaining === 0) {
      state.phase = 'finished';
      state.result = 'cleared';
      state.winnerId = playerId;
    } else {
      state.currentPlayerId = state.playerIds.find((id) => id !== playerId)!;
      state.turn += 1;
    }
  }
  state.lastAction = { playerId, cell, revealedCount };
  state.revision += 1;
  return null;
}
