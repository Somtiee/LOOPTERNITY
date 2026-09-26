/**
 * Pre-launch placeholder for the game route.
 *
 * Rendered instead of the game while the gate in `src/app/page.tsx` is on.
 * Static and server-rendered — it holds no state, touches no wallet, and
 * loads none of the game bundle.
 */
export function ComingSoon() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#04100a] px-6 text-center">
      {/* Robinhood-green bloom behind the wordmark. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 45%, rgba(0,200,5,0.16) 0%, rgba(4,16,10,0) 70%)",
        }}
      />

      <div className="relative flex flex-col items-center">
        <p className="font-[family-name:var(--font-display)] text-2xl tracking-[0.28em] text-[#f4ead4]/90 sm:text-3xl">
          LOOPTERNITY
        </p>
        <p className="mt-1.5 font-[family-name:var(--font-display)] text-[10px] tracking-[0.32em] text-[#00C805]/85">
          LOOPITERNS · PLAY-TO-MINT · ROBINHOOD CHAIN
        </p>

        <h1 className="mt-10 font-[family-name:var(--font-display)] text-4xl tracking-[0.18em] text-[#00C805] sm:text-6xl">
          COMING SOON
        </h1>

        <p className="mt-6 max-w-md text-sm leading-relaxed text-white/50 sm:text-base">
          Ten thousand playable characters, earned one run at a time. The climb
          opens shortly.
        </p>
      </div>
    </main>
  );
}
