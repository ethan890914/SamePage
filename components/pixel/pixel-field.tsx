import type { InputHTMLAttributes } from 'react';

type PixelFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
};

export function PixelField({ id, label, ...props }: PixelFieldProps) {
  return (
    <label className="pixel-field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} {...props} />
    </label>
  );
}
