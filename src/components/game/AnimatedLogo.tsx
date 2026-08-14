"use client";

const LETTERS = "LOOPTERNITY".split("");

type AnimatedLogoProps = {
  accent?: string;
  compact?: boolean;
};

export function AnimatedLogo({
  accent = "#ff6a2a",
  compact = false,
}: AnimatedLogoProps) {
  return (
    <div
      className={`logo-stage relative mx-auto select-none ${compact ? "py-2" : "py-6"}`}
      style={{ ["--logo-accent" as string]: accent }}
    >
      <div className="logo-aura" aria-hidden />
      <div className="logo-particles" aria-hidden>
        {Array.from({ length: 14 }, (_, i) => (
          <span key={i} className={`logo-particle logo-particle-${i + 1}`} />
        ))}
      </div>

      <h1
        className={`logo-title relative z-10 text-center font-[family-name:var(--font-display)] font-bold tracking-[0.18em] ${
          compact ? "text-3xl sm:text-4xl" : "text-4xl sm:text-5xl md:text-6xl"
        }`}
        aria-label="LOOPTERNITY"
      >
        {LETTERS.map((letter, i) => (
          <span
            key={`${letter}-${i}`}
            className="logo-letter inline-block"
            style={{ ["--letter-delay" as string]: `${0.08 + i * 0.055}s` }}
          >
            {letter}
          </span>
        ))}
      </h1>

      <p
        className={`logo-tagline relative z-10 mt-3 text-center font-[family-name:var(--font-display)] tracking-[0.42em] text-white/50 ${
          compact ? "text-[9px]" : "text-[10px] sm:text-xs"
        }`}
      >
        CLIMB FOREVER
      </p>
    </div>
  );
}
