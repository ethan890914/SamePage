export function PixelStatus({ label }: { label: string }) {
  return (
    <div className="pixel-status">
      <span aria-hidden="true" />
      {label}
    </div>
  );
}
