'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  ArrowLeft,
  Bomb,
  Flag,
  MousePointer2,
  RotateCcw,
  Settings2,
  X,
} from 'lucide-react';
import { PixelButton } from '@/components/pixel/pixel-button';
import type {
  MinesweeperCommand,
  MinesweeperPublicState,
} from '@/lib/minesweeper';
import type { PlayerView } from '@/lib/protocol';

export function MinesweeperGame({
  instanceId,
  players,
  selfId,
  state,
  status,
  error,
  onClearError,
  send,
  onExit,
}: {
  instanceId: string;
  players: PlayerView[];
  selfId: string;
  state: MinesweeperPublicState | null;
  status: string;
  error: string | null;
  onClearError: () => void;
  send: (instanceId: string, command: MinesweeperCommand) => void;
  onExit: () => void;
}) {
  const [mode, setMode] = useState<'reveal' | 'flag'>('reveal');
  const [focusedCell, setFocusedCell] = useState(0);
  const [pendingState, setPendingState] =
    useState<MinesweeperPublicState | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (status === 'connected') send(instanceId, { kind: 'sync' });
  }, [instanceId, status, send]);

  const connected = status === 'connected';
  if (!state || state.instanceId !== instanceId)
    return (
      <section className="minesweeper-game" aria-live="polite">
        <h1 className="font-heading">Minesweeper</h1>
        <p>
          {connected
            ? 'Opening your shared board…'
            : 'Reconnecting to your board…'}
        </p>
        <PixelButton
          disabled={!connected}
          onClick={() => send(instanceId, { kind: 'sync' })}
        >
          Reload board
        </PixelButton>
        <PixelButton disabled={!connected} onClick={onExit}>
          Back to lobby
        </PixelButton>
      </section>
    );
  const name = (id: string | null) =>
    players.find((player) => player.id === id)?.name ?? 'Your opponent';
  const bothConnected =
    players.length === 2 &&
    state.playerIds.every((id) =>
      players.some((player) => player.id === id && player.connected),
    );
  const finished = state.phase === 'finished';
  const paused = !connected || !bothConnected;
  const yourTurn = state.currentPlayerId === selfId;
  const pending = pendingState === state && !error;
  const canAct = !finished && !paused && yourTurn && !pending;
  const ready = state.replayReadyIds.includes(selfId);
  const flags = state.flags.filter(Boolean).length;
  const heading = finished
    ? state.result === 'abandoned'
      ? 'Round abandoned'
      : state.winnerId === selfId
        ? 'You win!'
        : `${name(state.winnerId)} wins!`
    : paused
      ? 'Game paused'
      : yourTurn
        ? 'Your turn'
        : `${name(state.currentPlayerId)}’s turn`;
  const description = finished
    ? state.result === 'abandoned'
      ? 'A player left the room. Return to setup to play again.'
      : state.result === 'exploded'
        ? `${name(state.lastAction?.playerId ?? null)} revealed a mine.`
        : `${name(state.winnerId)} revealed the final safe tile.`
    : paused
      ? 'Holding the board and turn while you reconnect.'
      : !state.generated
        ? `${name(state.startingPlayerId)} starts. The first reveal opens a safe area.`
        : state.lastAction
          ? `${name(state.lastAction.playerId)} opened ${state.lastAction.revealedCount} safe ${state.lastAction.revealedCount === 1 ? 'tile' : 'tiles'}.`
          : 'Choose a tile to reveal.';

  function act(cell: number, kind: 'reveal' | 'flag' | 'chord') {
    if (!canAct || !state) return;
    if (kind === 'flag' && state.revealed[cell]) return;
    if (kind === 'reveal' && state.flags[cell]) return;
    if (
      kind === 'chord' &&
      (!state.revealed[cell] || (state.cells[cell] ?? 0) <= 0)
    )
      return;
    const base = {
      round: state.round,
      turn: state.turn,
      revision: state.revision,
      cell,
    };
    setPendingState(state);
    send(
      instanceId,
      kind === 'flag'
        ? { ...base, kind, flagged: !state.flags[cell] }
        : { ...base, kind },
    );
  }

  function onCellKey(event: KeyboardEvent<HTMLButtonElement>, cell: number) {
    if (!state) return;
    const columns = state.settings.columns;
    const row = Math.floor(cell / columns);
    const column = cell % columns;
    let next = cell;
    switch (event.key) {
      case 'ArrowLeft':
        next = row * columns + Math.max(0, column - 1);
        break;
      case 'ArrowRight':
        next = row * columns + Math.min(columns - 1, column + 1);
        break;
      case 'ArrowUp':
        next = Math.max(0, row - 1) * columns + column;
        break;
      case 'ArrowDown':
        next = Math.min(state.settings.rows - 1, row + 1) * columns + column;
        break;
      case 'Home':
        next = event.ctrlKey ? 0 : row * columns;
        break;
      case 'End':
        next = event.ctrlKey
          ? state.cells.length - 1
          : row * columns + columns - 1;
        break;
      case 'f':
      case 'F':
        event.preventDefault();
        act(cell, 'flag');
        return;
      default:
        return;
    }
    event.preventDefault();
    setFocusedCell(next);
    buttons.current[next]?.focus();
  }

  return (
    <section className="minesweeper-game" aria-labelledby="minesweeper-title">
      <header className="minesweeper-header">
        <div>
          <p className="pixel-kicker">
            Round {state.round} · {state.settings.difficulty}
          </p>
          <h1 id="minesweeper-title" className="font-heading">
            Minesweeper
          </h1>
        </div>
        <PixelButton disabled={!connected} onClick={onExit}>
          <ArrowLeft size={16} /> Back to lobby
        </PixelButton>
      </header>
      <div className="minesweeper-players">
        {state.playerIds.map((id, index) => {
          const player = players.find((candidate) => candidate.id === id);
          return (
            <div
              key={id}
              className={`minesweeper-player ${!finished && state.currentPlayerId === id ? 'is-current' : ''} ${state.winnerId === id ? 'is-winner' : ''}`}
            >
              <span
                className={`game-entry-avatar avatar-art ${player?.avatarId ?? 'avatar-1'}`}
                aria-hidden="true"
              />
              <span>
                <strong>
                  {player?.name ?? `Player ${index + 1}`}
                  {id === selfId ? ' · you' : ''}
                </strong>
                <small>
                  {!player?.connected
                    ? 'Disconnected'
                    : state.winnerId === id
                      ? 'Winner'
                      : state.replayReadyIds.includes(id)
                        ? 'Ready for rematch'
                        : state.startingPlayerId === id
                          ? 'Starting player'
                          : `Player ${index + 1}`}
                </small>
              </span>
            </div>
          );
        })}
      </div>
      <output
        className={`minesweeper-turn ${yourTurn && !finished && !paused ? 'is-yours' : ''}`}
      >
        <h2 className="font-heading">{heading}</h2>
        <p>{description}</p>
      </output>
      {error && (
        <div className="lobby-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={onClearError}
          >
            <X size={17} />
          </button>
        </div>
      )}
      <div className="minesweeper-console">
        <div className="minesweeper-stats">
          <div>
            <strong>{String(state.mineCount - flags).padStart(3, '0')}</strong>
            <span>Mines − flags</span>
          </div>
          <Bomb size={28} aria-hidden="true" />
          <div>
            <strong>{String(state.safeRemaining).padStart(3, '0')}</strong>
            <span>Safe tiles left</span>
          </div>
        </div>
        {!finished && (
          <div className="minesweeper-tools" aria-label="Tile action">
            <PixelButton
              variant="tab"
              pressed={mode === 'reveal'}
              onClick={() => setMode('reveal')}
            >
              <MousePointer2 size={16} /> Reveal
            </PixelButton>
            <PixelButton
              variant="tab"
              pressed={mode === 'flag'}
              onClick={() => setMode('flag')}
            >
              <Flag size={16} /> Flag
            </PixelButton>
            <span>{pending ? 'Updating board…' : `Turn ${state.turn}`}</span>
          </div>
        )}
        <section
          className="minesweeper-board-scroll"
          aria-label="Scrollable Minesweeper board"
        >
          <table
            className="minesweeper-board"
            aria-label={`${state.settings.rows} by ${state.settings.columns} Minesweeper board`}
            aria-describedby="minesweeper-help"
          >
            <tbody>
              {Array.from({ length: state.settings.rows }, (_, row) => (
                <tr key={row} className="minesweeper-row">
                  {Array.from(
                    { length: state.settings.columns },
                    (_, column) => {
                      const cell = row * state.settings.columns + column;
                      const value = state.cells[cell];
                      const revealed = state.revealed[cell];
                      const mine = value === -1;
                      const flag = state.flags[cell];
                      const open = revealed || (finished && value !== null);
                      const wrongFlag =
                        finished && flag && value !== null && value !== -1;
                      const last = state.lastAction?.cell === cell;
                      const label = `Row ${row + 1}, column ${column + 1}: ${wrongFlag ? 'incorrect flag' : flag ? (finished && mine ? 'correctly flagged mine' : 'flagged') : mine ? 'mine' : open ? (value === 0 ? 'empty' : `${value} adjacent mines`) : 'hidden'}`;
                      return (
                        <td key={cell}>
                          <button
                            ref={(element) => {
                              buttons.current[cell] = element;
                            }}
                            type="button"
                            tabIndex={focusedCell === cell ? 0 : -1}
                            aria-label={label}
                            aria-disabled={!canAct}
                            onFocus={() => setFocusedCell(cell)}
                            className={`minesweeper-cell ${open ? 'is-open' : ''} ${flag ? 'is-flagged' : ''} ${wrongFlag ? 'is-wrong-flag' : ''} ${state.explodedCell === cell ? 'is-exploded' : ''} ${last ? 'is-last' : ''} ${finished && !revealed && !mine && !flag ? 'is-unplayed' : ''}`}
                            data-number={value ?? undefined}
                            onClick={() =>
                              act(
                                cell,
                                mode === 'flag'
                                  ? 'flag'
                                  : revealed
                                    ? 'chord'
                                    : 'reveal',
                              )
                            }
                            onContextMenu={(event) => {
                              event.preventDefault();
                              act(cell, 'flag');
                            }}
                            onKeyDown={(event) => onCellKey(event, cell)}
                          >
                            {wrongFlag ? (
                              <X size={18} aria-hidden="true" />
                            ) : flag ? (
                              <Flag
                                size={17}
                                fill="currentColor"
                                aria-hidden="true"
                              />
                            ) : mine ? (
                              <Bomb
                                size={19}
                                fill="currentColor"
                                aria-hidden="true"
                              />
                            ) : value !== null && value > 0 ? (
                              value
                            ) : (
                              ''
                            )}
                          </button>
                        </td>
                      );
                    },
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <p id="minesweeper-help" className="minesweeper-help">
        Click or tap to {mode === 'flag' ? 'flag' : 'reveal'}. Right-click or
        press F to flag. Use arrow keys to move and Enter or Space to activate.
        In Reveal mode, activate an open number to open its unflagged neighbors
        when the flag count matches. Flags are shared and may be wrong.
      </p>
      {finished && (
        <footer className="minesweeper-result-actions">
          {state.result !== 'abandoned' && (
            <PixelButton
              variant={ready ? 'secondary' : 'primary'}
              disabled={paused}
              aria-pressed={ready}
              onClick={() =>
                send(instanceId, {
                  kind: 'replay_ready',
                  round: state.round,
                  ready: !ready,
                })
              }
            >
              <RotateCcw size={16} />
              {ready ? 'Cancel rematch ready' : 'Rematch'}
            </PixelButton>
          )}
          <PixelButton
            disabled={!connected}
            onClick={() =>
              send(instanceId, { kind: 'return_to_setup', round: state.round })
            }
          >
            <Settings2 size={16} /> Game settings
          </PixelButton>
          {ready && (
            <output>
              Waiting for{' '}
              {name(state.playerIds.find((id) => id !== selfId) ?? null)} to get
              ready…
            </output>
          )}
        </footer>
      )}
    </section>
  );
}
