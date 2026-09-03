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
        className={`logo-title relative z-10 mx-auto flex w-full max-w-full flex-nowrap items-baseline justify-center overflow-hidden whitespace-nowrap font-[family-name:var(--font-display)] font-bold ${
          compact
            ? "text-[clamp(1.15rem,8vw,2.25rem)] tracking-[0.04em] sm:tracking-[0.12em]"
            : "text-[clamp(1.2rem,7.4vw,3.75rem)] tracking-[0.04em] sm:tracking-[0.12em] md:tracking-[0.16em]"
        }`}
        aria-label="LOOPTERNITY"
      >
        {LETTERS.map((letter, i) => (
          <span
            key={`${letter}-${i}`}
            className="logo-letter"
            style={{ ["--letter-delay" as string]: `${0.08 + i * 0.055}s` }}
          >
            {letter}
          </span>
        ))}
      </h1>

      <p
        className={`logo-tagline relative z-10 mt-3 text-center font-[family-name:var(--font-display)] tracking-[0.28em] text-white/50 sm:tracking-[0.42em] ${
          compact ? "text-[9px]" : "text-[10px] sm:text-xs"
        }`}
      >
        CLIMB FOREVER
      </p>
      <p
        className={`relative z-10 mt-1.5 text-center font-[family-name:var(--font-display)] tracking-[0.28em] text-[#00C805]/75 ${
          compact ? "text-[8px]" : "text-[9px] sm:text-[10px]"
        }`}
      >
        LOOPITERNS
      </p>
    </div>
  );
}
