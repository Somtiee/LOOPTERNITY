"use client";

/**
 * Live collection figures for the public mint page.
 *
 * The page is server-rendered with real numbers (see collectionStats.ts) so
 * its first paint and its link preview are never placeholders. This module
 * keeps them moving afterwards: one poller feeds every live region through a
 * context, so the strip and the rarity ladder can never disagree with each
 * other about how much is left.
 *
 * A failed refresh keeps the last good numbers on screen and says so. It
 * never blanks them and never reports sold out — only a read that came back
 * can do that.
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { formatEther } from "viem";
import { RARITIES } from "@/game/mintTiers";
import type { CollectionStats } from "@/server/loopiterns/collectionStats";
import { RARITY_INK } from "./rarityInk";
import styles from "./article.module.css";

/** Contract constant — MAX_PER_WALLET is compile-time, not a live read. */
const MAX_PER_WALLET = 10;

/** Poll cadence. The route's shared cache is 15s; this is comfortably slower. */
const POLL_MS = 30_000;

const CollectionContext = createContext<CollectionStats | null>(null);

export function CollectionStatsProvider({
  initial,
  children,
}: {
  initial: CollectionStats;
  children: ReactNode;
}) {
  const [stats, setStats] = useState<CollectionStats>(initial);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clear = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    // A chained timeout rather than an interval: a slow or hanging request
    // delays the next poll instead of stacking requests behind it.
    const schedule = () => {
      clear();
      timer = setTimeout(run, POLL_MS);
    };

    const run = async () => {
      if (cancelled.current) return;
      if (document.visibilityState === "hidden") {
        // Nobody is looking; resume on the visibilitychange below.
        return;
      }
      try {
        const res = await fetch("/api/loopitern/stats", { cache: "no-store" });
        if (!res.ok) throw new Error(`stats ${res.status}`);
        const next = (await res.json()) as CollectionStats;
        if (cancelled.current) return;
        if (next && typeof next === "object" && next.ok) setStats(next);
      } catch {
        // Keep the numbers already on screen. The strip reads readAt and
        // stale, so an old figure is labelled, never passed off as current.
      }
      schedule();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        clear();
        void run();
      } else {
        clear();
      }
    };

    // Poll once immediately: the server-rendered figures may be up to one
    // revalidate window old by the time the page is on screen.
    void run();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled.current = true;
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <CollectionContext.Provider value={stats}>
      {children}
    </CollectionContext.Provider>
  );
}

function useCollection(): CollectionStats {
  const stats = useContext(CollectionContext);
  if (!stats) {
    throw new Error("Live collection region rendered outside its provider");
  }
  return stats;
}

/** HH:MM UTC from an ISO timestamp — deterministic, so SSR and hydration match. */
function utcClock(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toISOString().slice(11, 16)} UTC`;
}

function count(value: number | null): string | null {
  if (value === null) return null;
  return value.toLocaleString("en-US");
}

function mintPriceLabel(wei: string | null): string | null {
  if (!wei) return null;
  try {
    return `${formatEther(BigInt(wei))} ETH`;
  } catch {
    return null;
  }
}

export function LiveStrip({ address }: { address: string | null }) {
  const stats = useCollection();
  const minted = count(stats.totalSupply);
  const price = mintPriceLabel(stats.mintPriceWei);
  const remaining = count(stats.remaining);

  const status = stats.soldOut
    ? "sold out"
    : stats.paused === true
      ? "minting is paused"
      : stats.paused === false
        ? "minting open"
        : null;

  const readClock = utcClock(stats.readAt);
  const neverRead = !stats.ok && stats.blockNumber === null;

  return (
    <>
      <div className={styles.strip}>
        <div>
          <span className={styles.k}>Hard cap</span>
          <span className={styles.v}>{count(stats.maxSupply)}</span>
        </div>
        <div>
          <span className={styles.k}>Minted</span>
          <span className={`${styles.v} ${styles.g}`}>{minted ?? "—"}</span>
        </div>
        <div>
          <span className={styles.k}>Mint price</span>
          <span className={styles.v}>{price ?? "—"}</span>
        </div>
        <div>
          <span className={styles.k}>Per wallet</span>
          <span className={styles.v}>{MAX_PER_WALLET}</span>
        </div>
      </div>

      <p className={styles.provenance}>
        {neverRead ? (
          <>
            Live figures are unavailable right now, so nothing is shown rather
            than something out of date. The contract is the source of truth —{" "}
            <a
              href="https://robinhoodchain.blockscout.com/address/0xF1d6AD543a47D84d5C624f80C0F22395BF524175"
              target="_blank"
              rel="noopener"
            >
              read it directly
            </a>
            .
          </>
        ) : (
          <>
            Read from the live contract{" "}
            {address ? <code>{address}</code> : null} on Robinhood Chain (4663)
            {stats.blockNumber !== null ? (
              <>
                {" "}
                at block <span className={styles.num}>{count(stats.blockNumber)}</span>
              </>
            ) : null}
            {readClock ? <> ({readClock})</> : null}.{" "}
            {remaining !== null ? <>{remaining} remaining</> : null}
            {remaining !== null && status ? <>, </> : null}
            {status}. Supply moves; the contract is the source of truth.
            {stats.stale ? (
              <>
                {" "}
                <strong>Live refresh is paused</strong> — these are the last
                figures that read back.
              </>
            ) : null}
          </>
        )}
      </p>
    </>
  );
}

/**
 * The rarity ladder, drawn to scale: the vertical gap between two tiers is
 * the real score you must add to reach the next one (--h is that gap in
 * units of 1,000 score, so the shape comes from minScore and cannot drift).
 * Remaining counts are live.
 */
export function LiveLadder() {
  const stats = useCollection();
  const remaining = stats.remainingByRarity;
  const top = RARITIES.length - 1;

  const rows: ReactNode[] = [];
  for (let i = top; i >= 0; i -= 1) {
    const rarity = RARITIES[i];
    const left = remaining ? remaining[i] : null;
    const soldOut = left === 0;

    rows.push(
      <div
        key={rarity.id}
        className={styles.tier}
        style={{ "--c": RARITY_INK[i] } as CSSProperties}
      >
        <span className={styles.pip} />
        <span className={styles.name}>{rarity.name}</span>
        <span className={styles.supply}>
          {count(rarity.supply)} supply
          {left !== null ? (
            <span className={styles.left}>
              {" "}
              · {soldOut ? "sold out" : `${count(left)} left`}
            </span>
          ) : null}
        </span>
        <span className={styles.gate}>Score {count(rarity.minScore)}</span>
      </div>,
    );

    // Gap down to the next tier (or to zero at the foot of the ladder).
    const nextScore = i > 0 ? RARITIES[i - 1].minScore : 0;
    const gap = Math.round((rarity.minScore - nextScore) / 1000);
    rows.push(
      <div
        key={`gap-${rarity.id}`}
        className={styles.spacer}
        style={{ "--h": gap } as CSSProperties}
        aria-hidden="true"
      />,
    );
  }

  return (
    <div className={styles.ladder} role="list">
      {rows}
      <div className={styles.ladderFoot}>
        <span>Standing start</span>
        <span>Score 0</span>
      </div>
    </div>
  );
}

/** Copy-to-clipboard for the contract address, with a select-text fallback. */
export function CopyAddress({ address }: { address: string }) {
  const [label, setLabel] = useState("Copy");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  const flash = (text: string) => {
    setLabel(text);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLabel("Copy"), 1800);
  };

  const onCopy = () => {
    const fallback = () => {
      // Clipboard refused — select the address so a manual copy still works.
      try {
        const node = document.getElementById("loopiterns-contract");
        if (!node) return;
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      } catch {
        // Nothing else to try; the address is on screen and selectable.
      }
      flash("Select & copy");
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(address).then(
        () => flash("Copied"),
        fallback,
      );
    } else {
      fallback();
    }
  };

  return (
    <button type="button" className={styles.copy} onClick={onCopy}>
      {label}
    </button>
  );
}

