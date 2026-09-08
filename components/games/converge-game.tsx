'use client';

import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import { ArrowLeft, Check, Dices, RotateCcw, Send } from 'lucide-react';
import { PixelButton } from '@/components/pixel/pixel-button';
import type { ConvergeCommand, ConvergePublicState } from '@/lib/converge';
import type { PlayerView } from '@/lib/protocol';
import { commonEnglishWords } from '@/lib/words/en/common';
import { convergeEnglish as copy } from '@/lib/i18n/converge';

function randomWord(previous: string) {
  const choices = commonEnglishWords.filter((word) => word !== previous);
  return choices[
    crypto.getRandomValues(new Uint32Array(1))[0] % choices.length
  ];
}

export function ConvergeGame({
  instanceId,
  players,
  selfId,
  state,
  status,
  send,
  onExit,
}: {
  instanceId: string;
  players: PlayerView[];
  selfId: string;
  state: ConvergePublicState | null;
  status: string;
  send: (instanceId: string, command: ConvergeCommand) => void;
  onExit: () => void;
}) {
  const [word, setWord] = useState('');
  const [now, setNow] = useState(0);
  const connected = status === 'connected';
  const submitted = Boolean(state?.submittedIds.includes(selfId));
  const latestReveal = state?.history.at(-1);

  useEffect(() => {
    send(instanceId, { kind: 'sync' });
  }, [instanceId, send]);

  useEffect(() => {
    if (!state?.deadline) return;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [state?.deadline]);

  const secondsLeft = useMemo(
    () =>
      state?.deadline
        ? now === 0
          ? state.settings.timeLimitSeconds
          : Math.max(0, Math.ceil((state.deadline - now) / 1000))
        : null,
    [now, state?.deadline, state?.settings.timeLimitSeconds],
  );

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanWord = word.trim();
    if (!state || !cleanWord || submitted) return;
    send(instanceId, { kind: 'submit', round: state.round, word: cleanWord });
    setWord('');
  }

  if (!state) {
    return (
      <section className="converge-game converge-game--loading">
        <p className="pixel-kicker">{copy.name}</p>
        <h1>{copy.joining}</h1>
      </section>
    );
  }

  const finished = state.phase !== 'playing';
  return (
    <section className="converge-game" aria-labelledby="converge-title">
      <header className="converge-toolbar">
        <div>
          <p className="pixel-kicker">{copy.name}</p>
          <h1 id="converge-title">
            {finished
              ? state.phase === 'won'
                ? copy.wonTitle
                : copy.lostTitle
              : copy.round(state.round)}
          </h1>
        </div>
        <div className="converge-toolbar-meta">
          {!finished && state.settings.mode === 'limited' && (
            <span>
              {copy.roundsLeft(state.settings.maxRounds - state.round + 1)}
            </span>
          )}
          {!finished && secondsLeft !== null && (
            <strong className={secondsLeft <= 3 ? 'is-urgent' : ''}>
              {secondsLeft}s
            </strong>
          )}
          {!finished && state.pausedRemainingMs !== null && (
            <span>{copy.paused}</span>
          )}
          <PixelButton
            className="converge-exit"
            onClick={onExit}
            disabled={!connected}
          >
            <ArrowLeft size={16} /> {copy.back}
          </PixelButton>
        </div>
      </header>

      <main className="converge-board">
        {finished ? (
          <div className={`converge-result converge-result--${state.phase}`}>
            <span className="converge-result-icon" aria-hidden="true">
              {state.phase === 'won' ? '★' : '↻'}
            </span>
            <p>
              {state.phase === 'won'
                ? copy.wonSummary(state.round)
                : copy.lostSummary(state.settings.maxRounds)}
            </p>
            {latestReveal?.words && (
              <div className="converge-pair converge-pair--result">
                <strong>{latestReveal.words[0]}</strong>
                <span>{state.phase === 'won' ? '=' : '≠'}</span>
                <strong>{latestReveal.words[1]}</strong>
              </div>
            )}
            <PixelButton
              variant="primary"
              disabled={!connected}
              onClick={() => send(instanceId, { kind: 'return_to_setup' })}
            >
              <RotateCcw size={17} />
              {copy.retry}
            </PixelButton>
          </div>
        ) : (
          <>
            <div className="converge-prompt">
              {state.baseWords ? (
                <>
                  <p>{copy.connectPrompt}</p>
                  <div className="converge-pair">
                    <strong>{state.baseWords[0]}</strong>
                    <span>+</span>
                    <strong>{state.baseWords[1]}</strong>
                  </div>
                </>
              ) : (
                <>
                  <p>{copy.openingPrompt}</p>
                  <h2>{copy.openingQuestion}</h2>
                </>
              )}
            </div>

            <form className="converge-submit" onSubmit={submit}>
              <label htmlFor="converge-word">{copy.yourWord}</label>
              <div className="converge-input-row">
                <input
                  id="converge-word"
                  value={word}
                  maxLength={40}
                  autoComplete="off"
                  disabled={!connected || submitted}
                  onChange={(event) => setWord(event.target.value)}
                  placeholder={
                    submitted ? copy.lockedPlaceholder : copy.inputPlaceholder
                  }
                />
                {state.round === 1 && !submitted && (
                  <PixelButton
                    type="button"
                    className="converge-random"
                    disabled={!connected}
                    onClick={() => setWord(randomWord(word))}
                    aria-label={copy.suggestLabel}
                  >
                    <Dices size={19} /> {copy.suggest}
                  </PixelButton>
                )}
                <PixelButton
                  type="submit"
                  variant="primary"
                  disabled={!connected || submitted || !word.trim()}
                >
                  <Send size={17} /> {copy.submit}
                </PixelButton>
              </div>
              <p>{submitted ? copy.submittedHelp : copy.privateHelp}</p>
            </form>

            <div className="converge-player-status" aria-live="polite">
              {players.map((player) => (
                <div
                  key={player.id}
                  className={
                    state.submittedIds.includes(player.id) ? 'is-submitted' : ''
                  }
                >
                  <span
                    className={`converge-avatar avatar-art ${player.avatarId}`}
                    aria-hidden="true"
                  />
                  <span>
                    <strong>
                      {player.name}
                      {player.id === selfId ? copy.you : ''}
                    </strong>
                    <small>
                      {!player.connected
                        ? copy.reconnecting
                        : state.submittedIds.includes(player.id)
                          ? copy.locked
                          : copy.thinking}
                    </small>
                  </span>
                  {state.submittedIds.includes(player.id) && (
                    <Check size={18} />
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {state.history.length > 0 && (
          <aside className="converge-history" aria-label={copy.history}>
            <h2>{copy.history}</h2>
            <div>
              {[...state.history].reverse().map((entry) => (
                <p key={entry.round}>
                  <span>R{entry.round}</span>
                  {entry.timedOut ? (
                    <em>{copy.timedOut}</em>
                  ) : (
                    <>
                      <strong>{entry.words?.[0]}</strong>
                      <i>{entry.matched ? '=' : '≠'}</i>
                      <strong>{entry.words?.[1]}</strong>
                    </>
                  )}
                </p>
              ))}
            </div>
          </aside>
        )}
      </main>
    </section>
  );
}
