import assert from 'node:assert/strict';
import {
  DEFAULT_MINESWEEPER_SETTINGS,
  isMinesweeperSettings,
  minesweeperMineCount,
} from '../lib/game-settings.ts';
import {
  applyMinesweeperMove,
  isMinesweeperCommand,
  newMinesweeperState,
  publicMinesweeperState,
} from '../lib/minesweeper.ts';
import { parseClientMessage, PROTOCOL_VERSION } from '../lib/protocol.ts';

const players = ['player-one', 'player-two'];
const settings = {
  ...DEFAULT_MINESWEEPER_SETTINGS,
  startingPlayer: 'player1',
};

function command(state, kind, cell, extra = {}) {
  return {
    kind,
    round: state.round,
    turn: state.turn,
    revision: state.revision,
    cell,
    ...extra,
  };
}

function fixedState(board) {
  const state = newMinesweeperState('test-instance', settings, players);
  state.settings = { ...settings, rows: 1, columns: board.length };
  state.board = board;
  state.generated = true;
  state.mineCount = board.filter((cell) => cell === -1).length;
  state.safeRemaining = board.length - state.mineCount;
  state.revealed = Array(board.length).fill(false);
  state.flags = Array(board.length).fill(false);
  return state;
}

function countNeighbors(board, cell, columns) {
  const rows = board.length / columns;
  const row = Math.floor(cell / columns);
  const column = cell % columns;
  let count = 0;
  for (let y = Math.max(0, row - 1); y <= Math.min(rows - 1, row + 1); y++) {
    for (
      let x = Math.max(0, column - 1);
      x <= Math.min(columns - 1, column + 1);
      x++
    ) {
      if ((y !== row || x !== column) && board[y * columns + x] === -1) count++;
    }
  }
  return count;
}

assert.equal(
  minesweeperMineCount({
    ...settings,
    rows: 8,
    columns: 8,
    difficulty: 'easy',
  }),
  8,
);
assert.equal(
  minesweeperMineCount({
    ...settings,
    rows: 9,
    columns: 9,
    difficulty: 'medium',
  }),
  13,
);
assert.equal(
  minesweeperMineCount({
    ...settings,
    rows: 16,
    columns: 30,
    difficulty: 'hard',
  }),
  96,
);
assert.equal(isMinesweeperSettings(settings), true);
assert.equal(isMinesweeperSettings({ ...settings, rows: 7 }), false);
assert.equal(
  isMinesweeperSettings({ ...settings, difficulty: 'nightmare' }),
  false,
);

for (const size of [
  [8, 8],
  [9, 9],
  [16, 16],
  [16, 30],
  [30, 30],
]) {
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const generated = newMinesweeperState(
      `generated-${size.join('-')}-${difficulty}`,
      { ...settings, rows: size[0], columns: size[1], difficulty },
      players,
    );
    const opening = Math.floor(generated.revealed.length / 2);
    assert.equal(
      applyMinesweeperMove(
        generated,
        players[0],
        command(generated, 'reveal', opening),
      ),
      null,
    );
    assert.ok(generated.board);
    assert.equal(
      generated.board.filter((cell) => cell === -1).length,
      generated.mineCount,
    );
    const openingRow = Math.floor(opening / size[1]);
    const openingColumn = opening % size[1];
    for (let y = openingRow - 1; y <= openingRow + 1; y++) {
      for (let x = openingColumn - 1; x <= openingColumn + 1; x++) {
        if (y >= 0 && y < size[0] && x >= 0 && x < size[1]) {
          assert.notEqual(
            generated.board[y * size[1] + x],
            -1,
            'safe opening contains a mine',
          );
        }
      }
    }
    generated.board.forEach((value, cell) => {
      if (value !== -1)
        assert.equal(value, countNeighbors(generated.board, cell, size[1]));
    });
  }
}

const secret = fixedState([-1, 1, 0]);
assert.deepEqual(publicMinesweeperState(secret).cells, [null, null, null]);
secret.revealed[1] = true;
assert.deepEqual(publicMinesweeperState(secret).cells, [null, 1, null]);

const turns = fixedState([-1, 1, 0]);
assert.equal(
  applyMinesweeperMove(turns, players[1], command(turns, 'reveal', 2)),
  'not_your_turn',
);
assert.equal(
  applyMinesweeperMove(turns, players[0], {
    ...command(turns, 'reveal', 2),
    turn: 99,
  }),
  'stale_round',
);
assert.equal(
  applyMinesweeperMove(
    turns,
    players[0],
    command(turns, 'flag', 0, { flagged: true }),
  ),
  null,
);
assert.equal(turns.currentPlayerId, players[0], 'flagging consumed the turn');
assert.equal(turns.turn, 1);
assert.equal(
  applyMinesweeperMove(turns, players[0], command(turns, 'reveal', 1)),
  null,
);
assert.equal(turns.currentPlayerId, players[1]);

const expansion = fixedState([-1, 1, 0]);
assert.equal(
  applyMinesweeperMove(expansion, players[0], command(expansion, 'reveal', 2)),
  null,
);
assert.equal(expansion.revealed[1], true, 'empty-area reveal did not expand');
assert.equal(expansion.result, 'cleared');

const explosion = fixedState([-1, 1]);
assert.equal(
  applyMinesweeperMove(explosion, players[0], command(explosion, 'reveal', 0)),
  null,
);
assert.equal(explosion.phase, 'finished');
assert.equal(explosion.result, 'exploded');
assert.equal(explosion.winnerId, players[1]);
assert.deepEqual(publicMinesweeperState(explosion).cells, [-1, 1]);

const clearing = fixedState([-1, 1]);
assert.equal(
  applyMinesweeperMove(clearing, players[0], command(clearing, 'reveal', 1)),
  null,
);
assert.equal(clearing.result, 'cleared');
assert.equal(clearing.winnerId, players[0]);

// A chord with the right number of incorrectly placed flags must explode,
// even if its other targets would clear the final safe tiles.
const chord = fixedState([1, -1, 1, 1]);
chord.settings = { ...settings, rows: 2, columns: 2 };
chord.revealed[0] = true;
chord.safeRemaining = 2;
chord.flags[3] = true;
assert.equal(
  applyMinesweeperMove(chord, players[0], command(chord, 'chord', 0)),
  null,
);
assert.equal(chord.result, 'exploded');
assert.equal(chord.explodedCell, 1);
assert.equal(chord.winnerId, players[1]);

assert.equal(isMinesweeperCommand({ kind: 'sync' }), true);
assert.equal(
  isMinesweeperCommand({
    kind: 'reveal',
    round: 1,
    turn: 1,
    revision: 0,
    cell: 0,
  }),
  true,
);
assert.equal(
  isMinesweeperCommand({
    kind: 'reveal',
    round: 1,
    turn: 1,
    revision: 0,
    cell: 900,
  }),
  false,
);

const protocolMessage = {
  type: 'minesweeper_command',
  protocolVersion: PROTOCOL_VERSION,
  requestId: 'request_12345678',
  instanceId: 'instance-1',
  command: { kind: 'reveal', round: 1, turn: 1, revision: 0, cell: 0 },
};
assert.equal(parseClientMessage(JSON.stringify(protocolMessage)).success, true);
assert.equal(
  parseClientMessage(
    JSON.stringify({
      ...protocolMessage,
      command: { ...protocolMessage.command, cell: -1 },
    }),
  ).success,
  false,
);

console.log('Minesweeper smoke checks passed.');
