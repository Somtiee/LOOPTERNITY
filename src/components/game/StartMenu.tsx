"use client";

import { useEffect, useState } from "react";
import { DIFFICULTIES, THEME_META } from "@/game/constants";
import { getTheme, listThemes, nextUtcHourChange } from "@/game/themes";
import { audio } from "@/game/audio/AudioManager";
import { formatRarityGate, RARITIES } from "@/game/mintTiers";
import type { CharacterId, DifficultyId, GameMode, ThemeId } from "@/game/types";
import { ConnectWalletButton } from "@/components/web3/ConnectWalletButton";
import { PlayerHub } from "@/components/web3/PlayerHub";
import { AnimatedLogo } from "./AnimatedLogo";
import { CharacterSelect } from "./CharacterSelect";
import { LoopiternEquip } from "./LoopiternEquip";
import { LoopiternPortrait } from "./LoopiternPortrait";
import { MuteButton } from "./MuteButton";
import type { EquippedLoopitern } from "@/web3/loopiterns/equip";
import { useLoopiternsSupply } from "@/web3/loopiterns/useLoopiternsSupply";

type StartMenuProps = {
  mode: GameMode;
  themeId: ThemeId;
  difficultyId: DifficultyId;
  characterId: CharacterId;
  onModeChange: (mode: GameMode) => void;
  onThemeChange: (id: ThemeId) => void;
  onDifficultyChange: (id: DifficultyId) => void;
  onCharacterChange: (id: CharacterId) => void;
  onStart: () => void;
  equipped: EquippedLoopitern | null;
  onEquip: (token: EquippedLoopitern | null) => void;
  /** P2M runs use the UTC-hour theme, not the picker. */
  p2mThemeId: ThemeId;
  /** Live sellout state from the contract. */
  soldOut: boolean;
  /** Both modes need a connected wallet before START unlocks. */
  walletConnected: boolean;
  /** P2M also needs the wallet on Robinhood Chain — the mint lives there. */
  onRobinhood: boolean;
};

const DIFFICULTY_ORDER: DifficultyId[] = ["easy", "medium", "hard"];

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Ticks near each UTC hour boundary so the countdown stays honest. */
function useUtcHourCountdown(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return nextUtcHourChange(now);
}

export function StartMenu({
  mode,
  themeId,
  difficultyId,
  characterId,
  onModeChange,
  onThemeChange,
  onDifficultyChange,
  onCharacterChange,
  onStart,
  equipped,
  onEquip,
  p2mThemeId,
  soldOut,
  walletConnected,
  onRobinhood,
}: StartMenuProps) {
  const [hubOpen, setHubOpen] = useState(false);
  const [tab, setTab] = useState<"characters" | "loopiterns">("characters");
  const themes = listThemes();
  const accent = getTheme(p2mThemeId).accent;
  const countdownMs = useUtcHourCountdown(mode === "p2m");
  const supply = useLoopiternsSupply();
  const p2mLocked = mode === "p2m" && soldOut;
  const walletReady =
    mode === "p2m" ? walletConnected && onRobinhood : walletConnected;
  const canStart =
    mode !== "p2e" && walletReady && (mode === "normal" || !soldOut);

  const click = (fn: () => void, sting?: "click" | "enemy") => {
    void audio.unlock();
    audio.sfx(sting ?? "click");
    fn();
  };

  return (
    <div
      className="relative h-dvh w-full overflow-y-auto overflow-x-hidden"
      style={{
        background: `radial-gradient(120% 80% at 50% 0%, #00C80514 0%, transparent 45%), linear-gradient(180deg, #050807 0%, #0a0f0c 100%)`,
        paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
      }}
    >
      <div
        className="absolute right-3 z-20 flex items-center gap-2 sm:right-5"
        style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={() => click(() => setHubOpen(true))}
          className="min-h-11 rounded-xl border border-white/15 bg-black/40 px-3 py-2 font-[family-name:var(--font-display)] text-[10px] tracking-[0.16em] text-white/80"
        >
          SCORES
        </button>
        <ConnectWalletButton size="sm" />
        <MuteButton />
      </div>

      <div
        className="mx-auto flex w-full max-w-3xl flex-col px-4 pb-8 sm:px-6"
        style={{
          paddingTop: "max(4.5rem, calc(env(safe-area-inset-top) + 3.5rem))",
        }}
      >
        <AnimatedLogo accent="#ff6a2a" />

        <p className="mx-auto mt-1 max-w-md text-center text-sm text-white/55">
          Survive the rise. Dodge. Manage shields.
        </p>

        {mode === "p2m" && supply.configured && soldOut ? (
          <div className="mt-6 rounded-2xl border border-[#00C805]/30 bg-[#00C805]/10 px-4 py-3 text-center">
            <p className="font-[family-name:var(--font-display)] text-xs tracking-[0.24em] text-[#00C805]">
              LOOPITERNS MINTED OUT
            </p>
          </div>
        ) : null}

        <section className="mt-8">
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-xs tracking-[0.28em] text-white/70">
            MODE
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => click(() => onModeChange("normal"))}
              className={`rounded-2xl border px-4 py-4 text-left transition duration-200 ${
                mode === "normal"
                  ? "border-[#00C805]/70 bg-[#00C805]/12"
                  : "border-white/10 bg-black/25 hover:border-white/25 hover:bg-white/5"
              }`}
              style={
                mode === "normal"
                  ? { boxShadow: `0 0 32px #00C80533` }
                  : undefined
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-[family-name:var(--font-display)] text-sm tracking-[0.18em] text-white">
                  NORMAL
                </span>
                <span className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] tracking-[0.14em] text-white/55">
                  FREE
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-white/45">
                Pick the world and difficulty. Beat your best.
              </p>
            </button>

            <button
              type="button"
              onClick={() => click(() => onModeChange("p2m"))}
              className={`rounded-2xl border px-4 py-4 text-left transition duration-200 ${
                mode === "p2m"
                  ? "border-[#00C805]/70 bg-[#00C805]/12"
                  : "border-white/10 bg-black/25 hover:border-white/25 hover:bg-white/5"
              }`}
              style={
                mode === "p2m"
                  ? { boxShadow: `0 0 32px #00C80533` }
                  : undefined
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-[family-name:var(--font-display)] text-sm tracking-[0.18em] text-white">
                  P2M
                </span>
                <span className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] tracking-[0.14em] text-white/55">
                  {mode === "p2m" && soldOut ? "MINTED OUT" : "FREE"}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-white/45">
                Survive to unlock a LOOPITERN mint.
              </p>
            </button>

            <button
              type="button"
              onClick={() => click(() => onModeChange("p2e"), "enemy")}
              className={`rounded-2xl border px-4 py-4 text-left transition duration-200 ${
                mode === "p2e"
                  ? "border-white/20 bg-white/[0.04]"
                  : "border-white/10 bg-black/25 hover:border-white/20 hover:bg-white/5"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-[family-name:var(--font-display)] text-sm tracking-[0.18em] text-white/70">
                  P2E
                </span>
                <span className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] tracking-[0.14em] text-white/45">
                  COMING SOON
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-white/35">
                Prize weeks are offline. Not startable.
              </p>
            </button>
          </div>
        </section>

        {mode === "p2e" ? (
          <section className="mt-7">
            <h2 className="mb-1 font-[family-name:var(--font-display)] text-xs tracking-[0.28em] text-white/70">
              P2E
            </h2>
            <div className="rounded-2xl border border-white/15 bg-white/[0.05] px-4 py-4">
              <p className="font-[family-name:var(--font-display)] text-sm tracking-[0.16em] text-white/80">
                COMING SOON
              </p>
              <p className="mt-2 text-xs leading-relaxed text-white/40">
                Weekly prize runs are offline. Climb in Normal or P2M.
              </p>
            </div>
          </section>
        ) : (
          <>
            {mode === "p2m" ? (
              <section className="mt-7">
                <h2 className="mb-3 font-[family-name:var(--font-display)] text-xs tracking-[0.28em] text-white/70">
                  THIS HOUR&apos;S WORLD
                </h2>
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#00C805]/35 bg-[#00C805]/10 px-3 py-1">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: accent }}
                    />
                    <span className="font-[family-name:var(--font-display)] text-[11px] tracking-[0.16em] text-white">
                      {getTheme(p2mThemeId).name.toUpperCase()}
                    </span>
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1.5 font-[family-name:var(--font-display)] text-[11px] tracking-[0.12em] text-[#00C805]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#00C805]" />
                    NEXT IN {formatCountdown(countdownMs)}
                  </span>
                </div>
              </section>
            ) : (
              <>
                {/* CHARACTERS | LOOPITERNS segmented control */}
                <section className="mt-7">
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    {(["characters", "loopiterns"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => click(() => setTab(t))}
                        className={`rounded-xl border px-3 py-2 font-[family-name:var(--font-display)] text-[11px] tracking-[0.2em] transition duration-200 ${
                          tab === t
                            ? "border-white/45 bg-white/12 text-white"
                            : "border-white/10 bg-black/25 text-white/55 hover:border-white/25 hover:text-white/80"
                        }`}
                      >
                        {t === "characters" ? "CHARACTERS" : "LOOPITERNS"}
                      </button>
                    ))}
                  </div>
                  {tab === "characters" ? (
                    <CharacterSelect
                      characterId={characterId}
                      accent={accent}
                      onChange={(id) => click(() => onCharacterChange(id))}
                    />
                  ) : (
                    <LoopiternEquip
                      mode={mode}
                      equipped={equipped}
                      onEquip={(token) => click(() => onEquip(token))}
                    />
                  )}
                </section>
              </>
            )}

            {mode === "p2m" ? (
              <section className="mt-7">
                <h2 className="mb-1 font-[family-name:var(--font-display)] text-xs tracking-[0.28em] text-white/70">
                  LOOPITERNS
                </h2>
                <p className="mb-3 text-[11px] text-white/35">
                  Vanilla climb — equipped LOOPITERNS don&apos;t apply here.
                </p>
                <LoopiternsSupplyPanel supply={supply} />
              </section>
            ) : (
              <>
                <section className="mt-7">
                  <h2 className="mb-3 font-[family-name:var(--font-display)] text-xs tracking-[0.28em] text-white/70">
                    THEME
                  </h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {themes.map((theme) => {
                      const selected = theme.id === themeId;
                      const info = THEME_META[theme.id];
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => {
                            audio.setTheme(theme.id);
                            click(() => onThemeChange(theme.id), "enemy");
                          }}
                          className={`rounded-2xl border px-3 py-3.5 text-left transition duration-200 ${
                            selected
                              ? "border-white/40 bg-white/10"
                              : "border-white/10 bg-black/25 hover:border-white/25 hover:bg-white/5"
                          }`}
                          style={
                            selected
                              ? { boxShadow: `0 0 32px ${theme.accent}33` }
                              : undefined
                          }
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ background: theme.accent }}
                            />
                            <span className="font-[family-name:var(--font-display)] text-[11px] tracking-[0.14em] text-white">
                              {theme.name.toUpperCase()}
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs text-white/50">
                            Enemy: {info.enemyLabel}
                          </p>
                          <p className="mt-1 text-[11px] leading-snug text-white/40">
                            {info.blurb}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="mt-7">
                  <h2 className="mb-1 font-[family-name:var(--font-display)] text-xs tracking-[0.28em] text-white/70">
                    DIFFICULTY
                  </h2>
                  <p className="mb-3 text-[11px] text-white/35">
                    Same climb. Harder rise.
                  </p>
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {DIFFICULTY_ORDER.map((id) => {
                      const d = DIFFICULTIES[id];
                      const selected = id === difficultyId;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => click(() => onDifficultyChange(id))}
                          className={`rounded-xl border px-2 py-3 text-center transition duration-200 sm:px-3 ${
                            selected
                              ? "border-[#00C805]/70 bg-[#00C805]/12 text-white"
                              : "border-white/10 bg-black/25 text-white/55 hover:border-white/25 hover:text-white/80"
                          }`}
                        >
                          <span className="font-[family-name:var(--font-display)] text-xs tracking-[0.18em] sm:text-sm">
                            {d.label.toUpperCase()}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              </>
            )}
          </>
        )}

        <div className="mx-auto mt-10 flex w-full max-w-md flex-col items-center gap-2">
          {mode === "p2e" || p2mLocked || walletReady ? (
            <button
              type="button"
              disabled={!canStart}
              onClick={() => {
                if (!canStart) return;
                void audio.unlock();
                audio.sfx("click");
                audio.sfx("start");
                onStart();
              }}
              className={`relative min-h-12 w-full overflow-hidden rounded-2xl px-6 py-3.5 font-[family-name:var(--font-display)] text-sm tracking-[0.28em] text-[#05140a] transition sm:text-base ${
                canStart
                  ? "start-pulse hover:brightness-110 active:scale-[0.99]"
                  : "cursor-not-allowed opacity-50"
              }`}
              style={{
                background: "linear-gradient(90deg, #00C805, #7CFF7C)",
                boxShadow: canStart ? "0 0 40px #00C80555" : undefined,
              }}
            >
              {mode === "p2e"
                ? "COMING SOON"
                : p2mLocked
                  ? "MINTED OUT"
                  : mode === "p2m"
                    ? "START P2M"
                    : "START RUN"}
            </button>
          ) : (
            <>
              <ConnectWalletButton size="lg" />
              <p className="text-center text-[11px] text-white/45">
                {mode === "p2m"
                  ? "Connect your wallet on Robinhood Chain to play."
                  : "Connect your wallet to play."}
              </p>
            </>
          )}
        </div>
      </div>

      {hubOpen ? (
        <PlayerHub accent={accent} onClose={() => setHubOpen(false)} />
      ) : null}
    </div>
  );
}

function LoopiternsSupplyPanel({
  supply,
}: {
  supply: ReturnType<typeof useLoopiternsSupply>;
}) {
  if (!supply.configured) {
    return (
      <p className="text-[11px] text-white/40">
        Mint supply is not live yet — 10,000 total.
      </p>
    );
  }

  const headline =
    supply.totalSupply !== null ? (
      <p className="mb-3 font-[family-name:var(--font-display)] text-xs tracking-[0.16em] text-white/70">
        {supply.totalSupply.toLocaleString()} / 10,000 MINTED
      </p>
    ) : supply.loading ? (
      <p className="mb-3 text-[11px] text-white/40">Loading supply…</p>
    ) : (
      <p className="mb-3 text-[11px] text-white/40">
        Live supply unavailable. Retry later.
      </p>
    );

  return (
    <div>
      {headline}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {RARITIES.map((rarity, i) => {
          const remaining = supply.remainingByRarity?.[i];
          return (
            <div
              key={rarity.id}
              className="rounded-xl border border-white/10 bg-black/25 px-2 py-2.5 text-center"
            >
              <div className="mx-auto flex justify-center">
                <LoopiternPortrait rarity={rarity.id} size="sm" />
              </div>
              <p
                className="mt-1.5 font-[family-name:var(--font-display)] text-[11px] tracking-[0.12em]"
                style={{ color: rarity.accent }}
              >
                {rarity.name}
              </p>
              <p className="mt-1 text-[10px] text-white/50">
                {formatRarityGate(rarity.minSeconds)}
              </p>
              <p className="mt-0.5 text-[10px] text-white/35">
                {remaining !== undefined
                  ? `${remaining.toLocaleString()} / ${rarity.supply.toLocaleString()}`
                  : supply.loading
                    ? "…"
                    : "—"}
              </p>
            </div>
          );
        })}
      </div>
      {supply.error ? (
        <p className="mt-2 text-[11px] text-white/40">
          Could not load live supply — the caps above are the tier limits, not
          live counts.
        </p>
      ) : null}
    </div>
  );
}
