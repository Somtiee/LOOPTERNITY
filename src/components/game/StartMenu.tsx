"use client";

import { useEffect, useRef, useState } from "react";
import { useChainModal, useConnectModal } from "@rainbow-me/rainbowkit";
import { useSwitchChain } from "wagmi";
import { DIFFICULTIES, THEME_META } from "@/game/constants";
import { listThemes, getTheme } from "@/game/themes";
import { audio } from "@/game/audio/AudioManager";
import type { CharacterId, DifficultyId, GameMode, ThemeId } from "@/game/types";
import { ConnectWalletButton } from "@/components/web3/ConnectWalletButton";
import { PlayerHub } from "@/components/web3/PlayerHub";
import { useOnchainWeekTheme } from "@/web3/hooks/useOnchainWeekTheme";
import { useWalletSession } from "@/web3/hooks/useWalletSession";
import {
  BASE_CHAIN,
  CHAIN_SWITCH_LABEL,
  WRONG_NETWORK_HINT,
} from "@/web3/config";
import { P2E_ENTRY_FEE_USD } from "@/web3/p2e/fees";
import { AnimatedLogo } from "./AnimatedLogo";
import { CharacterSelect } from "./CharacterSelect";
import { MuteButton } from "./MuteButton";

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
};

const P2E_PENDING_ACCENT = "#c4b5a0";
const DIFFICULTY_ORDER: DifficultyId[] = ["easy", "medium", "hard"];

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
}: StartMenuProps) {
  const { hasWallet, onBase, restoring } = useWalletSession();
  const { openConnectModal } = useConnectModal();
  const { openChainModal } = useChainModal();
  const { switchChainAsync } = useSwitchChain();
  const p2eWorld = useOnchainWeekTheme();
  const [hubOpen, setHubOpen] = useState(false);
  const pendingStart = useRef(false);
  const themes = listThemes();
  const menuThemeId = mode === "p2e" ? p2eWorld.themeId : themeId;
  const accent = menuThemeId
    ? getTheme(menuThemeId).accent
    : P2E_PENDING_ACCENT;
  const canStart = onBase && (mode !== "p2e" || p2eWorld.playable);

  const tryStart = () => {
    if (restoring) {
      pendingStart.current = true;
      return;
    }
    if (!hasWallet) {
      pendingStart.current = false;
      openConnectModal?.();
      return;
    }
    if (!onBase) {
      pendingStart.current = false;
      void switchChainAsync({ chainId: BASE_CHAIN.id }).catch(() => {
        openChainModal?.();
      });
      return;
    }
    if (mode === "p2e" && p2eWorld.status === "error") {
      pendingStart.current = false;
      p2eWorld.refetch();
      return;
    }
    if (!canStart) {
      pendingStart.current = false;
      return;
    }
    pendingStart.current = false;
    audio.sfx("start");
    onStart();
  };

  useEffect(() => {
    if (!pendingStart.current || restoring) return;
    tryStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when session finishes restoring
  }, [restoring, hasWallet, onBase]);

  const click = (fn: () => void, sting?: "click" | "enemy") => {
    void audio.unlock();
    audio.sfx(sting ?? "click");
    fn();
  };

  return (
    <div
      className="relative h-dvh w-full overflow-y-auto overflow-x-hidden"
      style={{
        background: `radial-gradient(120% 80% at 50% 0%, ${accent}22 0%, transparent 45%), linear-gradient(180deg, #070309 0%, #0c1018 100%)`,
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
        <AnimatedLogo accent={accent} />

        <p className="mx-auto mt-1 max-w-md text-center text-sm text-white/55">
          Survive the rise. Dodge. Manage shields.
        </p>

        <section className="mt-8">
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-xs tracking-[0.28em] text-white/70">
            MODE
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => click(() => onModeChange("normal"))}
              className={`rounded-2xl border px-4 py-4 text-left transition duration-200 ${
                mode === "normal"
                  ? "border-white/40 bg-white/10"
                  : "border-white/10 bg-black/25 hover:border-white/25 hover:bg-white/5"
              }`}
              style={
                mode === "normal" ? { boxShadow: `0 0 32px ${accent}33` } : undefined
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
                Free. Pick the world and difficulty. Beat your best.
              </p>
            </button>

            <button
              type="button"
              onClick={() => click(() => onModeChange("p2e"))}
              className={`rounded-2xl border px-4 py-4 text-left transition duration-200 ${
                mode === "p2e"
                  ? "border-white/35 bg-white/[0.07]"
                  : "border-white/10 bg-black/25 hover:border-white/20 hover:bg-white/5"
              }`}
              style={
                mode === "p2e" ? { boxShadow: `0 0 32px ${accent}33` } : undefined
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-[family-name:var(--font-display)] text-sm tracking-[0.18em] text-white/90">
                  P2E
                </span>
                <span
                  className="rounded-md border px-2 py-0.5 text-[10px] tracking-[0.14em]"
                  style={{
                    borderColor: `${accent}66`,
                    color: accent,
                    background: `${accent}14`,
                  }}
                >
                  ~${P2E_ENTRY_FEE_USD.toFixed(2)} / RUN
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-white/40">
                One world all week. ~${P2E_ENTRY_FEE_USD.toFixed(2)} a run. Top
                10 share the prize.
              </p>
            </button>
          </div>
        </section>

        <CharacterSelect
          characterId={characterId}
          accent={accent}
          onChange={(id) => click(() => onCharacterChange(id))}
        />

        {mode === "normal" ? (
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
                          ? "border-white/45 bg-white/12 text-white"
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
        ) : (
          <section className="mt-7">
            <h2 className="mb-1 font-[family-name:var(--font-display)] text-xs tracking-[0.28em] text-white/70">
              THIS WEEK
            </h2>
            <p className="mb-3 text-[11px] text-white/35">
              Same world for everyone. New one every Sunday.
            </p>
            <div
              className="rounded-2xl border border-white/20 bg-white/[0.07] px-4 py-4"
              style={{ boxShadow: `0 0 32px ${accent}33` }}
            >
              {p2eWorld.status === "loading" ? (
                <p className="text-sm text-white/55">Loading…</p>
              ) : p2eWorld.status === "error" ? (
                <button
                  type="button"
                  onClick={() => click(() => p2eWorld.refetch())}
                  className="min-h-11 w-full rounded-xl bg-[#ffe08a] px-3 py-2 font-[family-name:var(--font-display)] text-[11px] tracking-[0.16em] text-[#0a0608]"
                >
                  RETRY
                </button>
              ) : menuThemeId ? (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: accent }}
                    />
                    <span className="font-[family-name:var(--font-display)] text-sm tracking-[0.16em] text-white">
                      {getTheme(menuThemeId).name.toUpperCase()}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-white/50">
                    Enemy: {THEME_META[menuThemeId].enemyLabel}
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-white/40">
                    {THEME_META[menuThemeId].blurb}
                  </p>
                </>
              ) : (
                <p className="text-sm text-white/55">Loading…</p>
              )}
            </div>
          </section>
        )}

        <div className="mx-auto mt-10 flex w-full max-w-md flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void audio.unlock();
              audio.sfx("click");
              tryStart();
            }}
            className={`relative min-h-12 w-full overflow-hidden rounded-2xl px-6 py-3.5 font-[family-name:var(--font-display)] text-sm tracking-[0.28em] text-[#0a0608] transition sm:text-base ${
              canStart ? "start-pulse hover:brightness-110 active:scale-[0.99]" : "hover:brightness-110 active:scale-[0.99]"
            }`}
            style={{
              background: `linear-gradient(90deg, ${accent}, #ffe08a)`,
              boxShadow: `0 0 40px ${accent}55`,
            }}
          >
            {!hasWallet && !restoring
              ? "START RUN"
              : restoring
                ? "…"
                : !onBase
                ? `SWITCH TO ${CHAIN_SWITCH_LABEL}`
                : mode === "p2e" && p2eWorld.status === "loading"
                  ? "LOADING…"
                  : mode === "p2e" && p2eWorld.status === "error"
                    ? "RETRY"
                    : mode === "p2e" && !p2eWorld.playable
                      ? "THIS WEEK"
                      : mode === "p2e"
                        ? `ENTER · $${P2E_ENTRY_FEE_USD.toFixed(2)}`
                        : "START RUN"}
          </button>
          {!hasWallet || onBase || restoring ? null : (
            <p className="text-center text-[11px] text-white/40">
              {WRONG_NETWORK_HINT}
            </p>
          )}
        </div>
      </div>

      {hubOpen ? (
        <PlayerHub accent={accent} onClose={() => setHubOpen(false)} />
      ) : null}
    </div>
  );
}
