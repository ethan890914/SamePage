'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react';
import { ArrowLeft, RotateCcw, Send, SkipForward, Trophy } from 'lucide-react';
import { PixelButton } from '@/components/pixel/pixel-button';
import { patternRaceEnglish } from '@/lib/i18n/pattern-race';
import { patternRaceTraditionalChinese } from '@/lib/i18n/zh-TW';
import { useLanguage } from '@/lib/i18n/provider';
import type {
  PatternRaceCommand,
  PatternRaceGuessError,
  PatternRacePattern,
  PatternRaceState,
} from '@/lib/pattern-race';
import type { PlayerView } from '@/lib/protocol';

function patternSlots(pattern: PatternRacePattern) {
  if (pattern.length === null)
    return [pattern.firstLetter, '…', pattern.lastLetter];
  const length = pattern.length;
  return Array.from({ length }, (_, index) =>
    index === 0
      ? pattern.firstLetter
      : index === length - 1
        ? pattern.lastLetter
        : '_',
  );
}

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export function PatternRaceGame({
  instanceId,
  players,
  selfId,
  state,
  guessError,
  status,
  send,
  onExit,
}: {
  instanceId: string;
  players: PlayerView[];
  selfId: string;
  state: PatternRaceState | null;
  guessError: PatternRaceGuessError | null;
  status: string;
  send: (instanceId: string, command: PatternRaceCommand) => void;
  onExit: () => void;
}) {
  const [draft, setDraft] = useState({ round: 1, word: '' });
  const { locale, t } = useLanguage();
  const copy =
    locale === 'zh-TW' ? patternRaceTraditionalChinese : patternRaceEnglish;
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const connected = status === 'connected';

  useEffect(() => {
    send(instanceId, { kind: 'sync' });
  }, [instanceId, send]);

  useEffect(() => {
    if (state?.phase === 'playing' && state.pausedRemainingMs === null)
      inputRef.current?.focus();
  }, [state?.phase, state?.round, state?.pausedRemainingMs]);

  useEffect(() => {
    if (!state?.deadline && !state?.nextProblemAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [state?.deadline, state?.nextProblemAt]);

  const timeLeft = useMemo(
    () => (state?.deadline ? state.deadline - now : null),
    [now, state?.deadline],
  );

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanWord = draft.round === state?.round ? draft.word.trim() : '';
    if (!state || !cleanWord || state.phase !== 'playing') return;
    send(instanceId, { kind: 'submit', round: state.round, word: cleanWord });
  }

  if (!state) {
    return (
      <section className="pattern-race pattern-race--loading">
        <p className="pixel-kicker">{copy.name}</p>
        <h1>{copy.joining}</h1>
      </section>
    );
  }

  const roundWinner = players.find(
    (player) => player.id === state.roundWinnerId,
  );
  const gameWinners = players.filter((player) =>
    state.gameWinnerIds.includes(player.id),
  );
  const remainingProblems =
    state.settings.mode === 'problems' ? state.settings.problemCount : null;
  const slots = patternSlots(state.pattern);
  const word = draft.round === state.round ? draft.word : '';
  const inputDisabled =
    !connected ||
    players.some((player) => !player.connected) ||
    state.phase !== 'playing' ||
    state.pausedRemainingMs !== null ||
    (timeLeft !== null && timeLeft <= 0);

  return (
    <section className="pattern-race" aria-labelledby="pattern-race-title">
      <header className="pattern-race-toolbar">
        <div>
          <p className="pixel-kicker">{copy.name}</p>
          <h1 id="pattern-race-title">
            {state.phase === 'finished'
              ? copy.finalTitle
              : copy.problem(state.round)}
          </h1>
        </div>
        <div className="pattern-race-toolbar-meta">
          {remainingProblems !== null && state.phase !== 'finished' && (
            <span>{t('First to {0} points', [remainingProblems])}</span>
          )}
          {timeLeft !== null && state.phase !== 'finished' && (
            <strong className={timeLeft <= 30_000 ? 'is-urgent' : ''}>
              {formatTime(timeLeft)}
            </strong>
          )}
          {state.pausedRemainingMs !== null && <span>{copy.paused}</span>}
          <PixelButton onClick={onExit} disabled={!connected}>
            <ArrowLeft size={16} /> {copy.back}
          </PixelButton>
        </div>
      </header>

      <main className="pattern-race-board">
        <div className="pattern-race-scoreboard" aria-label={copy.score}>
          {players.map((player) => (
            <div
              key={player.id}
              className={
                player.id === state.roundWinnerId ? 'is-round-winner' : ''
              }
            >
              <span
                className={`pattern-race-avatar avatar-art ${player.avatarId}`}
                aria-hidden="true"
              />
              <span>
                <strong>
                  {player.name}
                  {player.id === selfId ? copy.you : ''}
                </strong>
                <small>{player.connected ? copy.score : copy.paused}</small>
              </span>
              <output>{state.scores[player.id] ?? 0}</output>
            </div>
          ))}
        </div>

        {state.phase === 'playing' ? (
          <div className="pattern-race-play">
            <div className="pattern-race-prompt">
              <p>{copy.prompt}</p>
              <div className="pattern-race-slots" aria-label={slots.join(' ')}>
                {slots.map((slot, index) => (
                  <span
                    key={`${state.round}-${index}`}
                    className={`${slot === '_' || slot === '…' ? 'is-blank' : ''} ${slot === '…' ? 'is-open' : ''}`}
                  >
                    {slot}
                  </span>
                ))}
              </div>
              <small>
                {state.pattern.length === null
                  ? copy.anyLength
                  : t('{0} letters', [state.pattern.length])}
              </small>
            </div>

            <form className="pattern-race-submit" onSubmit={submit}>
              <label htmlFor="pattern-race-word">{copy.yourAnswer}</label>
              <div>
                <input
                  ref={inputRef}
                  id="pattern-race-word"
                  lang="en"
                  value={word}
                  maxLength={40}
                  autoComplete="off"
                  disabled={inputDisabled}
                  aria-invalid={Boolean(guessError)}
                  aria-describedby="pattern-race-help"
                  onChange={(event) =>
                    setDraft({ round: state.round, word: event.target.value })
                  }
                  placeholder={copy.placeholder}
                />
                <PixelButton
                  type="submit"
                  variant="primary"
                  disabled={inputDisabled || !word.trim()}
                >
                  <Send size={17} /> {copy.submit}
                </PixelButton>
              </div>
              <p
                id="pattern-race-help"
                className={guessError ? 'is-error' : ''}
                role={guessError ? 'alert' : undefined}
              >
                {guessError === 'pattern_mismatch'
                  ? copy.patternMismatch
                  : guessError === 'not_in_dictionary'
                    ? copy.notInDictionary
                    : copy.firstWins}
              </p>
            </form>
            <div className="pattern-race-result">
              <PixelButton
                disabled={inputDisabled || state.skipIds?.includes(selfId)}
                onClick={() =>
                  send(instanceId, { kind: 'skip', round: state.round })
                }
              >
                <SkipForward size={17} />
                {state.skipIds?.includes(selfId)
                  ? t('Skip requested · waiting for partner')
                  : t('Skip ({0}/2)', [state.skipIds?.length ?? 0])}
              </PixelButton>
              <small>
                {t('Both players must agree to skip. No points are awarded.')}
              </small>
            </div>
          </div>
        ) : state.phase === 'round_won' ? (
          <div className="pattern-race-result pattern-race-result--round">
            <Trophy size={42} aria-hidden="true" />
            <h2>
              {state.roundWinnerId
                ? copy.roundWinner(roundWinner?.name ?? t('Player'))
                : t('Problem skipped')}
            </h2>
            {state.winningWord && <strong>{state.winningWord}</strong>}
            <output aria-live="polite">
              {state.nextProblemAt != null
                ? t('Next problem in {0}…', [Math.min(3, Math.max(0, Math.ceil((state.nextProblemAt - now) / 1000)))])
                : copy.paused}
            </output>
          </div>
        ) : (
          <div className="pattern-race-result pattern-race-result--final">
            <Trophy size={52} aria-hidden="true" />
            <h2>
              {gameWinners.length === 2
                ? state.history.length === 0
                  ? copy.noWinner
                  : copy.tie
                : copy.winner(gameWinners[0]?.name ?? t('Player'))}
            </h2>
            {state.winningWord && <strong>{state.winningWord}</strong>}
            <PixelButton
              variant="primary"
              disabled={!connected}
              onClick={() => send(instanceId, { kind: 'return_to_setup' })}
            >
              <RotateCcw size={17} /> {copy.playAgain}
            </PixelButton>
          </div>
        )}

        {state.history.length > 0 && (
          <aside className="pattern-race-history" aria-label={copy.history}>
            <h2>{copy.history}</h2>
            <div>
              {[...state.history].reverse().map((entry) => {
                const winner = players.find(
                  (player) => player.id === entry.winnerId,
                );
                return (
                  <p key={entry.round}>
                    <span>#{entry.round}</span>
                    <strong>{entry.word}</strong>
                    <small>{winner?.name}</small>
                  </p>
                );
              })}
            </div>
          </aside>
        )}
      </main>
    </section>
  );
}
