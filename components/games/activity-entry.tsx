import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { PixelButton } from '@/components/pixel/pixel-button';

type ActivityEntryProps = {
  title: string;
  subtitle: string;
  eyebrow: string;
  variant: string;
  players: ReactNode;
  status: string;
  actions: ReactNode;
  children: ReactNode;
  onExit: () => void;
  exitDisabled: boolean;
};

/** Shared scrolling entry content with an always-visible bottom action row. */
export function ActivityEntry({
  title,
  subtitle,
  eyebrow,
  variant,
  players,
  status,
  actions,
  children,
  onExit,
  exitDisabled,
}: ActivityEntryProps) {
  return (
    <section
      className={`game-entry activity-entry game-entry--${variant}`}
      aria-labelledby="game-entry-title"
    >
      <div className="game-entry-content">
        <header className="game-entry-header">
          <div className="game-entry-heading">
            <p className="pixel-kicker">{eyebrow}</p>
            <h2 id="game-entry-title" className="font-heading">
              {title}
            </h2>
            <p className="text-muted-foreground">{subtitle}</p>
          </div>
          <div className="game-entry-controls">
            {players}
            <output className="game-entry-status">{status}</output>
          </div>
        </header>
        <div className="game-entry-grid">{children}</div>
      </div>
      <footer className="activity-entry-footer">
        <PixelButton
          className="activity-entry-back"
          onClick={onExit}
          disabled={exitDisabled}
        >
          <ArrowLeft size={16} /> Back to lobby
        </PixelButton>
        {actions}
      </footer>
    </section>
  );
}
