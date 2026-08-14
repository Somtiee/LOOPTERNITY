"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex h-dvh w-full flex-col items-center justify-center bg-[#070309] px-6 text-center">
      <p className="font-[family-name:var(--font-display)] text-sm tracking-[0.28em] text-[#ffe08a]">
        LOOPTERNITY
      </p>
      <p className="mt-4 max-w-sm text-sm text-white/70">
        Could not load the game. Retry — nothing here should stay blank.
      </p>
      <p className="mt-2 max-w-sm text-[11px] text-white/40">
        {error.message || "Unknown error"}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 min-h-12 w-full max-w-xs rounded-xl bg-[#ffe08a] px-4 py-3 font-[family-name:var(--font-display)] text-sm tracking-[0.2em] text-[#0a0608]"
      >
        RETRY
      </button>
    </main>
  );
}
