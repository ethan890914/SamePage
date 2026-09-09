'use client';
import { useLanguage } from '@/lib/i18n/provider';

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
  const { t } = useLanguage();
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
        <h1 className="font-heading">{t('Minesweeper')}</h1>
        <p>
          {connected
            ? t('Opening your shared board…')
            : t('Reconnecting to your board…')}
        </p>
        <PixelButton
          disabled={!connected}
          onClick={() => send(instanceId, { kind: 'sync' })}
        >
          {t('Reload board')}
        </PixelButton>
        <PixelButton disabled={!connected} onClick={onExit}>
          {t('Back to lobby')}
        </PixelButton>
      </section>
    );
  const name = (id: string | null) =>
    players.find((player) => player.id === id)?.name ?? t('Your opponent');
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
      ? t('Round abandoned')
      : state.winnerId === selfId
        ? t('You win!')
        : t('{0} wins!', [name(state.winnerId)])
    : paused
      ? t('Game paused')
      : yourTurn
        ? t('Your turn')
        : t('{0}’s turn', [name(state.currentPlayerId)]);
  const description = finished
    ? state.result === 'abandoned'
      ? t('A player left the room. Return to setup to play again.')
      : state.result === 'exploded'
        ? t('{0} revealed a mine.', [name(state.lastAction?.playerId ?? null)])
        : t('{0} revealed the final safe tile.', [name(state.winnerId)])
    : paused
      ? t('Holding the board and turn while you reconnect.')
      : !state.generated
        ? t('{0} starts. The first reveal opens a safe area.', [
            name(state.startingPlayerId),
          ])
        : state.lastAction
          ? t('{0} opened {1} safe {2}.', [
              name(state.lastAction.playerId),
              state.lastAction.revealedCount,
              state.lastAction.revealedCount === 1 ? 'tile' : 'tiles',
            ])
          : t('Choose a tile to reveal.');

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
            {t('Round {0} · {1}', [
              state.round,
              t(
                { easy: 'Easy', medium: 'Medium', hard: 'Hard' }[
                  state.settings.difficulty
                ],
              ),
            ])}
          </p>
          <h1 id="minesweeper-title" className="font-heading">
            {t('Minesweeper')}
          </h1>
        </div>
        <PixelButton disabled={!connected} onClick={onExit}>
          <ArrowLeft size={16} />
          {t('Back to lobby')}
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
                  {player?.name ?? t('Player {0}', [index + 1])}
                  {id === selfId ? t(' · you') : ''}
                </strong>
                <small>
                  {!player?.connected
                    ? t('Disconnected')
                    : state.winnerId === id
                      ? t('Winner')
                      : state.replayReadyIds.includes(id)
                        ? t('Ready for rematch')
                        : state.startingPlayerId === id
                          ? t('Starting player')
                          : t('Player {0}', [index + 1])}
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
          <span>{t(error)}</span>
          <button
            type="button"
            aria-label={t('Dismiss error')}
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
            <span>{t('Mines − flags')}</span>
          </div>
          <Bomb size={28} aria-hidden="true" />
          <div>
            <strong>{String(state.safeRemaining).padStart(3, '0')}</strong>
            <span>{t('Safe tiles left')}</span>
          </div>
        </div>
        {!finished && (
          <div className="minesweeper-tools" aria-label={t('Tile action')}>
            <PixelButton
              variant="tab"
              pressed={mode === 'reveal'}
              onClick={() => setMode('reveal')}
            >
              <MousePointer2 size={16} />
              {t('Reveal')}
            </PixelButton>
            <PixelButton
              variant="tab"
              pressed={mode === 'flag'}
              onClick={() => setMode('flag')}
            >
              <Flag size={16} />
              {t('Flag')}
            </PixelButton>
            <span>
              {pending ? t('Updating board…') : t('Turn {0}', [state.turn])}
            </span>
          </div>
        )}
        <section
          className="minesweeper-board-scroll"
          aria-label={t('Scrollable Minesweeper board')}
        >
          <table
            className="minesweeper-board"
            aria-label={t('{0} by {1} Minesweeper board', [
              state.settings.rows,
              state.settings.columns,
            ])}
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
                      const label = t('Row {0}, column {1}: {2}', [
                        row + 1,
                        column + 1,
                        wrongFlag
                          ? t('incorrect flag')
                          : flag
                            ? finished && mine
                              ? t('correctly flagged mine')
                              : t('flagged')
                            : mine
                              ? t('mine')
                              : open
                                ? value === 0
                                  ? t('empty')
                                  : t('{0} adjacent mines', [value])
                                : t('hidden'),
                      ]);
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
        {t(
          'Click or tap to {0}. Right-click or press F to flag. Use arrow keys to move and Enter or Space to activate. In Reveal mode, activate an open number to open its unflagged neighbors when the flag count matches. Flags are shared and may be wrong.',
          [t(mode === 'flag' ? 'flag' : 'reveal')],
        )}
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
              {ready ? t('Cancel rematch ready') : t('Rematch')}
            </PixelButton>
          )}
          <PixelButton
            disabled={!connected}
            onClick={() =>
              send(instanceId, { kind: 'return_to_setup', round: state.round })
            }
          >
            <Settings2 size={16} />
            {t('Game settings')}
          </PixelButton>
          {ready && (
            <output>
              {t('Waiting for {0} to get ready…', [
                name(state.playerIds.find((id) => id !== selfId) ?? null),
              ])}
            </output>
          )}
        </footer>
      )}
    </section>
  );
}
