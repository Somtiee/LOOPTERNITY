import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { formatEther } from "viem";
import { RARITIES } from "@/game/mintTiers";
import { formatScore } from "@/game/score";
import { modifiersForRarity, type RunModifiers } from "@/game/traits";
import { getCollectionStats } from "@/server/loopiterns/collectionStats";
import { getLoopiternsAddress } from "@/web3/loopiterns/address";
import {
  CollectionStatsProvider,
  CopyAddress,
  LiveLadder,
  LiveStrip,
} from "./LiveCollection";
import { RarityGallery } from "./RarityGallery";
import { RARITY_INK } from "./rarityInk";
import styles from "./article.module.css";

/**
 * Public mint page — the article that gets posted to X, served at
 * https://loopternity.xyz/LOOPITERNS.
 *
 * Freshness: the figures come from a server-side chain read at render time
 * and the page is revalidated every 30s, so the HTML (and any link preview
 * built from it) never carries a build-time snapshot. LiveStrip/LiveLadder
 * then keep the visible numbers moving while the tab is open. Nothing on
 * this page reads a wallet.
 */

/** Seconds the rendered figures may age before Next re-renders the page. */
export const revalidate = 30;

/**
 * The root layout disables zoom because the game needs a fixed viewport.
 * This page is long-form text, so it hands zoom back. Next merges viewport
 * fields across segments rather than replacing them, so maximumScale and
 * userScalable have to be restated here — omitting them inherits the game's.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#04100a",
};

const SITE_ORIGIN = "https://loopternity.xyz";
const EXPLORER = "https://robinhoodchain.blockscout.com";
const X_HANDLE = "https://x.com/LoopTernity";

export const metadata: Metadata = {
  title: "The LOOPITERNS Mint",
  description:
    "10,000 playable characters on Robinhood Chain. Reach a score in LOOPTERNITY, have the server verify the run, and mint the rarity you earned.",
  openGraph: {
    title: "The LOOPITERNS Mint",
    description:
      "10,000 playable characters on Robinhood Chain, earned one verified run at a time.",
    url: `${SITE_ORIGIN}/LOOPITERNS`,
    siteName: "LOOPTERNITY",
    images: [{ url: `${SITE_ORIGIN}/loopiterns/rarity-4.png` }],
    type: "article",
  },
  twitter: {
    card: "summary",
    title: "The LOOPITERNS Mint",
    description:
      "10,000 playable characters on Robinhood Chain, earned one verified run at a time.",
    images: [`${SITE_ORIGIN}/loopiterns/rarity-4.png`],
  },
};

/** Ability text straight from the equipped-traits table, never retyped by hand. */
function abilityLabel(modifiers: RunModifiers): string {
  const parts: string[] = [];
  if (modifiers.freezeCharges > 0) {
    parts.push(`Freeze, ${modifiers.freezeDuration}s`);
  }
  if (modifiers.tsunamiCharges > 0) parts.push("Tsunami");
  return parts.length > 0 ? parts.join(" + ") : "—";
}

export default async function LoopiternsPage() {
  const stats = await getCollectionStats();
  const address = getLoopiternsAddress() ?? null;

  // Rendered from the same read as the strip. If the owner changes the price
  // the prose follows within one revalidate window; the strip is live.
  const mintPrice =
    stats.mintPriceWei === null
      ? null
      : `${formatEther(BigInt(stats.mintPriceWei))} ETH`;

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>
            <span className={styles.dot} />
            Play-to-mint · Live on Robinhood Chain
          </p>
          <p className={styles.wordmark}>LOOPITERNS</p>
          <h1>Ten thousand characters, earned one run at a time.</h1>
          <p className={styles.lede}>
            LOOPITERNS is a collection of 10,000 playable characters on
            Robinhood Chain. You don&apos;t win one in a lottery and you
            don&apos;t buy one sight-unseen. You claim one by reaching a score
            in <strong>LOOPTERNITY</strong> that the server can independently
            prove you actually reached.
          </p>
        </header>

        <CollectionStatsProvider initial={stats}>
          <section>
            <LiveStrip address={address} />
          </section>

          <hr className={styles.rule} />

          <section>
            <h2>The game behind the mint</h2>
            <div className={styles.prose}>
              <p>
                LOOPTERNITY is a vertical endless survival game. You climb a
                fixed shard of world with a wall on each side, and the ground
                below you is rising. Magma, toxic gas or a cold front,
                depending on the world you&apos;re standing in. It never stops,
                and it never slows down for you.
              </p>
              <p>
                Three shields. A hit costs one and buys you a moment of grace.
                Lose the last one and the run is over. Dodge left and right,
                boost upward to open space above the rise, and keep doing it
                for as long as you can.
              </p>
              <p>
                The pressure escalates on a schedule you can learn. At 0:28,
                1:05 and 1:50 an undertow drags you back down toward the
                danger, then keeps pulsing up to three times its strength for
                the rest of the run. Boost is your answer to all of it. Worlds
                come with their own hazards: dragons in the volcanic shard,
                aliens in the planetary nebula, polar bears on the Antarctic
                ice. Three difficulties, from a forgiving climb to one that
                hunts you.
              </p>
            </div>
          </section>

          <hr className={styles.rule} />

          <section>
            <h2>How play-to-mint works</h2>
            <div className={styles.steps}>
              <div className={styles.step}>
                <span className={styles.n}>01</span>
                <div>
                  <h3>Play a P2M run</h3>
                  <p>
                    Everyone climbing for a mint shares{" "}
                    <strong>one world per hour</strong>, rotating on the UTC
                    hour, with vanilla rules. No equipped character bonuses
                    apply in P2M. Whatever you clear, you cleared on the same
                    terms as everyone else on the board.
                  </p>
                </div>
              </div>
              <div className={styles.step}>
                <span className={styles.n}>02</span>
                <div>
                  <h3>Reach a score gate</h3>
                  <p>
                    Each rarity opens at a score threshold, starting at{" "}
                    <strong>{formatScore(RARITIES[0].minScore)}</strong>. Score
                    comes from the climb itself, the ground you cover sideways,
                    the near misses you thread, and the seconds you spend
                    boosting. Aggressive play pulls a gate earlier than a
                    cautious run of the same length.
                  </p>
                </div>
              </div>
              <div className={styles.step}>
                <span className={styles.n}>03</span>
                <div>
                  <h3>Let the server verify it</h3>
                  <p>
                    When the run&apos;s score crosses a gate, the run is
                    replayed server-side from its recorded inputs. If the
                    replayed run genuinely ends at or above that gate,
                    you&apos;re issued a signed voucher for that rarity. If it
                    doesn&apos;t, you get nothing.
                  </p>
                </div>
              </div>
              <div className={styles.step}>
                <span className={styles.n}>04</span>
                <div>
                  <h3>Mint on Robinhood Chain</h3>
                  <p>
                    Spend the voucher and{" "}
                    <strong>{mintPrice ?? "the current mint price"}</strong> to
                    mint the rarity you cleared. One verified run mints once.
                    Capped at 10 per wallet; the collection is capped at 10,000
                    forever.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className={styles.callout}>
              <h3>Why the score can be trusted</h3>
              <p>
                A score sent from a browser is worth nothing, so it is never
                what decides your mint. The server issues a run seed when you
                start, the client records every input it feeds the
                deterministic simulation, and the server re-runs that exact log
                (same seed, same world, same constants) to produce the score
                that authorises a voucher. Typing a bigger number into a
                console buys you nothing.
              </p>
              <p>
                The voucher itself is an EIP-712 signature bound to the minter,
                the rarity, a deadline, a one-time nonce, the chain and the
                contract. The nonce is derived from the run, and the contract
                refuses to honour it twice — so a second mint from the same run
                reverts on-chain. One run, one character.
              </p>
            </div>
          </section>

          <hr className={styles.rule} />

          <section>
            <h2>The ladder</h2>
            <p className={`${styles.prose} ${styles.muted}`}>
              Five rarities, gated by score. Spacing below is drawn to scale:
              the vertical distance between two tiers is the real score you
              have to add to reach the next one. The first step is the longest
              from a standing start.
            </p>
            <LiveLadder />
          </section>

          <hr className={styles.rule} />

          <section>
            <h2>The five LOOPITERNS</h2>
            <p className={`${styles.prose} ${styles.muted}`}>
              The LOOPITERNS: 5 distinct rarities. Common is a sprout on a rock,
              Uncommon is already on the rope, Rare carries a mantle of ice
              crystal, Epic stands in bone-white plate, and Legendary turns up
              crowned, with the tsunami it commands at its back. Each tier is
              the same character one step further up the same ladder.
            </p>
            <RarityGallery />
          </section>

          <hr className={styles.rule} />

          <section>
            <h2>What a LOOPITERN does</h2>
            <div className={styles.prose}>
              <p>
                Every character is playable. Equip one in Normal mode and it
                changes how the run feels: more shields before you break, a
                faster climb and steer, and at the higher rarities an ability
                you can fire mid-run.
              </p>
            </div>
            <div className={styles.roster}>
              <table>
                <thead>
                  <tr>
                    <th>Rarity</th>
                    <th className={styles.num}>Shields</th>
                    <th className={styles.num}>Climb &amp; move</th>
                    <th>Ability</th>
                  </tr>
                </thead>
                <tbody>
                  {RARITIES.map((rarity) => {
                    const modifiers = modifiersForRarity(rarity.id);
                    const climbPct = Math.round(
                      (modifiers.speedMul - 1) * 100,
                    );
                    const ability = abilityLabel(modifiers);
                    return (
                      <tr key={rarity.id}>
                        <td
                          className={styles.tierName}
                          style={{ color: RARITY_INK[rarity.id] }}
                        >
                          {rarity.name}
                        </td>
                        <td className={styles.num}>{modifiers.maxShields}</td>
                        <td className={styles.num}>+{climbPct}%</td>
                        <td className={ability === "—" ? styles.muted : undefined}>
                          {ability}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={styles.provenance}>
              Freeze stops the danger where it stands. Tsunami washes every
              enemy off the field and holds the next spawn back. Both are
              charges you spend, not permanent states. Neither applies in P2M,
              where the ladder is climbed vanilla.
            </p>
          </section>

          <hr className={styles.rule} />

          <section>
            <h2>Three ways to play</h2>
            <div className={styles.modes}>
              <div className={styles.mode}>
                <div className={styles.top}>
                  <h3>Normal</h3>
                  <span className={`${styles.tag} ${styles.live}`}>Free</span>
                </div>
                <p>
                  Pick your world, difficulty and character, then beat your own
                  best score. Equipped LOOPITERNS apply here, so this is where
                  a minted character gets to show what it does.
                </p>
              </div>
              <div className={styles.mode}>
                <div className={styles.top}>
                  <h3>P2M</h3>
                  <span className={`${styles.tag} ${styles.live}`}>
                    Score to mint
                  </span>
                </div>
                <p>
                  One shared world an hour, vanilla rules. Reach a gate, get a
                  verified voucher, mint the character you earned. This is the
                  only mode that mints.
                </p>
              </div>
              <div className={styles.mode}>
                <div className={styles.top}>
                  <h3>P2E</h3>
                  <span className={styles.tag}>Coming soon</span>
                </div>
                <p>
                  Weekly prize runs are offline for now. We&apos;d rather ship
                  them working than announce them early.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2>Start a run</h2>
            <div className={`${styles.prose} ${styles.small} ${styles.muted}`}>
              <p>
                You&apos;ll need a wallet on Robinhood Chain with a little ETH
                for the mint and gas. <strong>Play &amp; mint</strong> opens the
                game straight into <strong>P2M</strong> on the hour&apos;s
                world, with the character drawn for that world already picked —
                change it before you launch if you&apos;d rather run as someone
                else. Your run starts the moment you launch, so take your first
                attempt seriously: the score that earns a voucher is one you
                actually survived to.
              </p>
            </div>
            <div className={styles.addr}>
              <span className={styles.label}>
                LOOPITERNS contract · Robinhood Chain 4663
              </span>
              <code id="loopiterns-contract">
                {address ?? "not configured in this build"}
              </code>
              {address ? <CopyAddress address={address} /> : null}
            </div>
            <div className={styles.ctaRow}>
              <Link className={styles.cta} href="/?mode=p2m">
                Play &amp; mint
              </Link>
              <a
                className={`${styles.cta} ${styles.ghost}`}
                href={address ? `${EXPLORER}/address/${address}` : EXPLORER}
                target="_blank"
                rel="noopener"
              >
                View the contract
              </a>
            </div>
          </section>

          <footer>
            <span className={styles.brand}>LOOPTERNITY</span>
            <p>
              LOOPITERNS are playable characters in a game. Minting costs real
              ETH on Robinhood Chain mainnet and is not an investment, a
              security, or a promise of financial return. Supply, price and
              rules are enforced by the contract; everything described here is
              gameplay. The figures above are read from chain and move as people
              mint. Contract details are the authority. Check them yourself
              before you spend anything.
            </p>
            <p>
              Follow along on X:{" "}
              <a href={X_HANDLE} target="_blank" rel="noopener">
                @LoopTernity
              </a>
            </p>
          </footer>
        </CollectionStatsProvider>
      </div>
    </div>
  );
}
