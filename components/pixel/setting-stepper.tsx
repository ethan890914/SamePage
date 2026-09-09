import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/provider';

export function SettingStepper<T extends string | number>({
  label,
  options,
  value,
  format,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  format: (value: T) => string;
  onChange: (value: T) => void;
}) {
  const { locale } = useLanguage();
  const index = Math.max(0, options.indexOf(value));
  const select = (offset: number) => {
    onChange(options[(index + offset + options.length) % options.length]);
  };
  return (
    <fieldset className="game-setting-stepper">
      {/* <legend className="sr-only">{label}</legend> */}
      <button
        type="button"
        onClick={() => select(-1)}
        aria-label={locale === 'zh-TW' ? `上一個${label}` : `Previous ${label}`}
      >
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <output aria-live="polite">{format(value)}</output>
      <button
        type="button"
        onClick={() => select(1)}
        aria-label={locale === 'zh-TW' ? `下一個${label}` : `Next ${label}`}
      >
        <ChevronRight size={20} aria-hidden="true" />
      </button>
    </fieldset>
  );
}
