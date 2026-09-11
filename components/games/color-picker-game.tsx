'use client';

import { useEffect, useMemo, useState, type PointerEvent } from 'react';
import { ArrowLeft, Lock, RotateCcw } from 'lucide-react';
import { PixelButton } from '@/components/pixel/pixel-button';
import type { ColorPickerCommand, ColorPickerPublicState, RGB } from '@/lib/color-picker';
import type { PlayerView } from '@/lib/protocol';
import { useLanguage } from '@/lib/i18n/provider';

function hsvToRgb(h: number, s: number, v: number): RGB {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}
const cssColor = (color: RGB) => `rgb(${color.r} ${color.g} ${color.b})`;

export function ColorPickerGame({ instanceId, players, selfId, state, status, send, onExit }: {
  instanceId: string; players: PlayerView[]; selfId: string; state: ColorPickerPublicState | null; status: string;
  send: (instanceId: string, command: ColorPickerCommand) => void; onExit: () => void;
}) {
  const { t } = useLanguage();
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [value, setValue] = useState(1);
  const [now, setNow] = useState(Date.now());
  const color = useMemo(() => hsvToRgb(hue, saturation, value), [hue, saturation, value]);
  const locked = Boolean(state?.submittedIds.includes(selfId));
  const latest = state?.history.at(-1);

  useEffect(() => { send(instanceId, { kind: 'sync' }); }, [instanceId, send]);
  useEffect(() => {
    setHue(0); setSaturation(0); setValue(1);
  }, [state?.round]);
  useEffect(() => {
    if (!state?.deadline) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [state?.deadline]);
  useEffect(() => {
    if (state?.phase === 'pick' && !locked) send(instanceId, { kind: 'preview', round: state.round, color });
  }, [color, instanceId, locked, send, state?.phase, state?.round]);
  const seconds = state?.deadline ? Math.max(0, Math.ceil((state.deadline - now) / 1000)) : null;

  function choose(event: PointerEvent<HTMLDivElement>) {
    if (!state || state.phase !== 'pick' || locked) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setSaturation(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)));
    setValue(1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)));
  }
  if (!state) return <section className="color-picker-game"><h1>{t('Loading Color Picker…')}</h1></section>;
  const totals = [...players].sort((a, b) => (state.totals[b.id] ?? 0) - (state.totals[a.id] ?? 0));
  return (
    <section className="color-picker-game">
      <header className="color-picker-toolbar">
        <div><p className="pixel-kicker">{t('Color Picker')}</p><h1>{state.phase === 'finished' ? t('Final score') : t('Round {0} of {1}', [state.round, state.settings.rounds])}</h1></div>
        <div className="color-picker-toolbar-actions">{seconds !== null && <strong className={seconds <= 3 ? 'is-urgent' : ''}>{t('{0} sec', [seconds])}</strong>}<PixelButton onClick={onExit} disabled={status !== 'connected'}><ArrowLeft size={16} /> {t('Back to arcade')}</PixelButton></div>
      </header>
      <div className="color-picker-scores">{totals.map((player) => <div key={player.id}><span>{player.name}{player.id === selfId ? t(' · you') : ''}</span><strong>{(state.totals[player.id] ?? 0).toFixed(1)}</strong></div>)}</div>
      {state.phase === 'memorize' ? (
        <main className="color-memory"><p>{t('Memorize this color')}</p><div className="color-target" style={{ background: cssColor(state.target) }} /></main>
      ) : state.phase === 'pick' ? (
        <main className="color-pick-area">
          <div className="color-current" style={{ background: cssColor(color) }}><span>{locked ? t('Locked in') : t('Your color')}</span></div>
          <div className="color-controls">
            <p>{t('The target is hidden. Recreate it from memory.')}</p>
            <div className="color-board" style={{ backgroundColor: `hsl(${hue} 100% 50%)` }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); choose(event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) choose(event); }}>
              <i className="color-board-white" /><i className="color-board-black" /><b style={{ left: `${saturation * 100}%`, top: `${(1 - value) * 100}%` }} />
            </div>
            <input className="color-hue" aria-label={t('Hue')} type="range" min="0" max="359" value={hue} disabled={locked} onChange={(event) => setHue(Number(event.target.value))} />
            <PixelButton variant="primary" disabled={locked || status !== 'connected'} onClick={() => send(instanceId, { kind: 'submit', round: state.round, color })}><Lock size={16} />{locked ? t('Locked in') : t('Lock in')}</PixelButton>
            <small>{locked ? t('Waiting for the other player…') : t('Your current color locks automatically when time runs out.')}</small>
          </div>
        </main>
      ) : (
        <main className="color-reveal">
          <div className="color-result-grid"><article><div style={{ background: cssColor(latest!.target) }} /><strong>{t('Target')}</strong></article>{players.map((player) => <article key={player.id}><div style={{ background: cssColor(latest!.guesses[player.id]) }} /><strong>{player.name}</strong><span>{latest!.scores[player.id].toFixed(1)} / 100</span></article>)}</div>
          {state.phase === 'finished' ? <><h2>{totals[0] && totals[1] && state.totals[totals[0].id] === state.totals[totals[1].id] ? t('It’s a tie!') : t('{0} wins!', [totals[0]?.name ?? ''])}</h2><PixelButton variant="primary" onClick={() => send(instanceId, { kind: 'return_to_setup' })}><RotateCcw size={16} /> {t('Play again')}</PixelButton></> : <p className="color-next-round">{t('Next round starts in {0}…', [seconds ?? 5])}</p>}
        </main>
      )}
    </section>
  );
}
