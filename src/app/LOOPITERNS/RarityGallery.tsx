"use client";

/**
 * The five LOOPITERNS, as art.
 *
 * A snap rail rather than a scripted carousel: native scrolling, native
 * momentum, native arrow-key support on a focused rail, and nothing to
 * hydrate wrong. The tier data comes from RARITIES and the counts come from
 * the page's single stats poller, so a card can never disagree with the
 * ladder above it about how much of a tier is left.
 *
 * Each card's plate is painted the artwork's own ground colour. The PNGs are
 * drawn on a near-black field rather than transparency, so matching the plate
 * to it lets the picture sit flush with no blend mode and no feathered edge
 * faking the join — and no edge mask, which would have cropped the rope that
 * runs off the top of Uncommon and the crown on Legendary.
 */

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { loopiternPortraitSrc } from "@/game/loopiternArt";
import { RARITIES } from "@/game/mintTiers";
import { formatScore } from "@/game/score";
import { useCollection } from "./LiveCollection";
import { RARITY_INK } from "./rarityInk";
import styles from "./article.module.css";

/** JS-driven scrolling is outside the reach of the stylesheet's own guard. */
function scrollBehavior(): ScrollBehavior {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return reduced ? "auto" : "smooth";
}

function count(value: number): string {
  return value.toLocaleString("en-US");
}

export function RarityGallery() {
  const stats = useCollection();
  const railRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  /** Snap position, plus whether there is anywhere left to travel. */
  const readPosition = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const railLeft = rail.getBoundingClientRect().left;
    let nearest = 0;
    let nearestGap = Infinity;
    Array.from(rail.children).forEach((card, i) => {
      const gap = Math.abs(card.getBoundingClientRect().left - railLeft);
      if (gap < nearestGap) {
        nearestGap = gap;
        nearest = i;
      }
    });
    setActive(nearest);
    setAtStart(rail.scrollLeft <= 1);
    setAtEnd(rail.scrollLeft >= rail.scrollWidth - rail.clientWidth - 1);
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    readPosition();

    // rAF-coalesced: scroll fires far more often than the dots need to move.
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        readPosition();
      });
    };

    rail.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", readPosition);
    return () => {
      rail.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", readPosition);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [readPosition]);

  const goTo = useCallback((index: number) => {
    const rail = railRef.current;
    const card = rail?.children[index] as HTMLElement | undefined;
    if (!rail || !card) return;
    // Bring the card's left edge to the rail's, whatever the current offset —
    // measured rather than computed, so it cannot drift from the stylesheet.
    rail.scrollTo({
      left:
        rail.scrollLeft +
        card.getBoundingClientRect().left -
        rail.getBoundingClientRect().left,
      behavior: scrollBehavior(),
    });
  }, []);

  const nudge = useCallback((delta: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const cards = Array.from(rail.children) as HTMLElement[];
    const first = cards[0];
    const second = cards[1];
    if (!first) return;
    const step = second
      ? second.getBoundingClientRect().left - first.getBoundingClientRect().left
      : first.getBoundingClientRect().width;
    rail.scrollBy({ left: delta * step, behavior: scrollBehavior() });
  }, []);

  return (
    <div className={styles.gallery}>
      <div
        ref={railRef}
        className={styles.rail}
        tabIndex={0}
        role="group"
        aria-label="The five LOOPITERNS rarities"
      >
        {RARITIES.map((rarity, i) => {
          const left = stats.remainingByRarity?.[i] ?? null;
          return (
            <article
              key={rarity.id}
              className={styles.card}
              style={{ "--c": RARITY_INK[i] } as CSSProperties}
            >
              <div className={styles.plate}>
                <Image
                  className={styles.art}
                  src={loopiternPortraitSrc(rarity.id)}
                  alt={`LOOPITERN ${rarity.name} — base artwork`}
                  width={1024}
                  height={1024}
                  sizes="(max-width: 560px) 58vw, 240px"
                />
              </div>
              <div className={styles.meta}>
                <p className={styles.cardName}>
                  <span className={styles.cardIndex}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {rarity.name}
                </p>
                <p className={styles.cardGate}>
                  Score{" "}
                  <span className={styles.num}>{formatScore(rarity.minScore)}</span>
                </p>
                <p className={styles.cardSupply}>
                  <span className={styles.num}>{count(rarity.supply)}</span>{" "}
                  supply
                  {left === null ? null : left === 0 ? (
                    <>
                      {" · "}
                      <span className={styles.cardOut}>sold out</span>
                    </>
                  ) : (
                    <>
                      {" · "}
                      <span className={styles.num}>{count(left)}</span> left
                    </>
                  )}
                </p>
              </div>
            </article>
          );
        })}
      </div>

      <div className={styles.controls}>
        <div className={styles.dots}>
          {RARITIES.map((rarity, i) => (
            <button
              key={rarity.id}
              type="button"
              className={`${styles.dot} ${i === active ? styles.dotOn : ""}`}
              onClick={() => goTo(i)}
              aria-label={`Show ${rarity.name}`}
              aria-current={i === active}
            />
          ))}
        </div>
        <div className={styles.arrows}>
          <button
            type="button"
            className={styles.arrow}
            onClick={() => nudge(-1)}
            disabled={atStart}
            aria-label="Previous rarity"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M15 5 8 12l7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className={styles.arrow}
            onClick={() => nudge(1)}
            disabled={atEnd}
            aria-label="Next rarity"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="m9 5 7 7-7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
