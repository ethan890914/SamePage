import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PixelButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'tab';
  pressed?: boolean;
};

export function PixelButton({
  children,
  className,
  pressed,
  variant = 'secondary',
  ...props
}: PixelButtonProps) {
  return (
    <button
      className={cn(
        'pixel-button',
        `pixel-button--${variant}`,
        pressed && 'is-pressed',
        className,
      )}
      aria-pressed={variant === 'tab' ? pressed : undefined}
      {...props}
    >
      {children}
    </button>
  );
}
