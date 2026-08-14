type DangerProximityBarProps = {
  proximity: number;
  label: string;
  accent: string;
};

/** Compact chrome meter — sits in the strip under the playfield, bottom-right. */
export function DangerProximityBar({
  proximity,
  label,
  accent,
}: DangerProximityBarProps) {
  const prox = Math.max(0, Math.min(1, proximity));
  const hot = prox > 0.65;
  const status = prox < 0.25 ? "SAFE" : prox < 0.55 ? "CLOSE" : "DANGER";
  const short = label.length > 7 ? label.slice(0, 5) : label;

  return (
    <aside
      className="flex w-[108px] items-center gap-1.5"
      aria-label={`${label} proximity ${status}`}
    >
      <span className="shrink-0 text-[8px] uppercase tracking-[0.1em] text-white/35">
        {short}
      </span>
      <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-[width] duration-150"
          style={{
            width: `${Math.round(prox * 100)}%`,
            background: accent,
            opacity: hot ? 1 : 0.7,
          }}
        />
      </div>
      <span
        className="shrink-0 text-[8px] uppercase tracking-[0.08em]"
        style={{ color: hot ? accent : "rgba(255,255,255,0.4)" }}
      >
        {status}
      </span>
    </aside>
  );
}
