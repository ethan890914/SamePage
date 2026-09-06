import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PixelPanelProps = {
  children: ReactNode;
  className?: string;
  eyebrow?: string;
  title?: string;
};

export function PixelPanel({
  children,
  className,
  eyebrow,
  title,
}: PixelPanelProps) {
  return (
    <section className={cn('pixel-panel', className)}>
      {(eyebrow || title) && (
        <header className="mb-6">
          {eyebrow && <p className="pixel-kicker">{eyebrow}</p>}
          {title && (
            <h2 className="mt-2 font-heading text-2xl tracking-[-.035em]">
              {title}
            </h2>
          )}
        </header>
      )}
      {children}
    </section>
  );
}
