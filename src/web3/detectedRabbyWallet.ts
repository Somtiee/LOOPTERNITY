"use client";

import type { Wallet, WalletDetailsParams } from "@rainbow-me/rainbowkit";
import { rabbyWallet } from "@rainbow-me/rainbowkit/wallets";
import type { EIP1193Provider } from "viem";
import { createConnector } from "wagmi";
import { injected } from "wagmi/connectors";

export const RABBY_RDNS = "io.rabby";

type RabbyWindowProvider = EIP1193Provider & { isRabby?: boolean };

let eip6963Rabby: EIP1193Provider | undefined;
let listening = false;
/** Every rdns that has announced, for the diagnostic. */
const announcedRdns = new Set<string>();

function onEip6963Announce(event: Event) {
  const detail = (
    event as CustomEvent<{
      info?: { rdns?: string };
      provider?: EIP1193Provider;
    }>
  ).detail;
  if (detail?.info?.rdns) announcedRdns.add(detail.info.rdns);
  if (detail?.info?.rdns === RABBY_RDNS && detail.provider) {
    eip6963Rabby = detail.provider;
  }
}

/**
 * Attach the announce listener once, but re-ping `eip6963:requestProvider` on
 * EVERY call. A wallet that injects after this module evaluates would
 * otherwise never be asked again, so Rabby would read as uninstalled forever.
 */
function ensureEip6963Rabby() {
  if (typeof window === "undefined") return;
  if (!listening) {
    listening = true;
    window.addEventListener(
      "eip6963:announceProvider",
      onEip6963Announce as EventListener,
    );
  }
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

if (typeof window !== "undefined") {
  ensureEip6963Rabby();
}

/**
 * Rabby's own provider — never assume it is window.ethereum.
 *
 * Resolution order matters when several wallet extensions are installed:
 *   1. EIP-6963 announce (rdns `io.rabby`) — the only source where the wallet
 *      names ITSELF, so it cannot be confused by another extension.
 *   2. `window.rabby` — Rabby's dedicated global, not shared with anyone.
 *   3. Flag sniffing on `window.ethereum` — the contested object. Last resort:
 *      wallets routinely copy each other's `is*` flags for dapp compatibility,
 *      so a true `isRabby` here does not prove which extension will answer.
 */
export function getRabbyProvider(): EIP1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  ensureEip6963Rabby();
  const w = window as Window & {
    rabby?: EIP1193Provider;
    ethereum?: RabbyWindowProvider & {
      providers?: RabbyWindowProvider[];
    };
  };
  if (eip6963Rabby) return eip6963Rabby;
  if (w.rabby) return w.rabby;
  if (w.ethereum?.isRabby) return w.ethereum;
  const fromList = w.ethereum?.providers?.find(
    (p: RabbyWindowProvider) => p.isRabby === true,
  );
  if (fromList) return fromList;
  return undefined;
}

/**
 * Multi-wallet diagnostic. Dev only, reachable as
 * `loopternityDebug.injectedWallets()` — run it when "Rabby" connects to the
 * wrong extension or the request hangs with no popup.
 */
export function debugInjectedWallets(): void {
  if (typeof window === "undefined") return;
  const w = window as Window & {
    rabby?: RabbyWindowProvider;
    ethereum?: RabbyWindowProvider & { providers?: RabbyWindowProvider[] };
  };
  ensureEip6963Rabby();

  const rows: { source: string; isRabby: boolean | undefined; flags: string }[] =
    [];
  const describe = (source: string, p?: RabbyWindowProvider) => {
    if (!p) return;
    const flags = Object.keys(p).filter((k) => k.startsWith("is"));
    rows.push({
      source,
      isRabby: p.isRabby,
      flags: flags.length > 0 ? flags.join(", ") : "(no is* flags)",
    });
  };

  describe("window.rabby", w.rabby);
  describe("window.ethereum", w.ethereum);
  w.ethereum?.providers?.forEach((p: RabbyWindowProvider, i: number) =>
    describe(`window.ethereum.providers[${i}]`, p),
  );
  describe("eip6963:io.rabby", eip6963Rabby);

  console.table(rows);
  console.info(
    "[LOOPTERNITY] EIP-6963 rdns seen:",
    announcedRdns.size > 0 ? [...announcedRdns].join(", ") : "(none announced)",
  );
  console.info(
    "[LOOPTERNITY] getRabbyProvider() resolved:",
    eip6963Rabby
      ? "EIP-6963 announce"
      : w.rabby
        ? "window.rabby"
        : w.ethereum?.isRabby
          ? "window.ethereum (flag sniff — contested, may be another extension)"
          : w.ethereum?.providers?.some(
                (p: RabbyWindowProvider) => p.isRabby === true,
              )
            ? "window.ethereum.providers (flag sniff — contested)"
            : "none — Rabby was not detected",
  );
}

/**
 * How long to wait for a wallet to answer before giving the user control back.
 * Deliberately generous: approving a connection in the Rabby popup is a human
 * action, and aborting a legitimate approval would be worse than the hang. This
 * only fires on a request that never settles at all — the "popup never opened"
 * case.
 */
const CONNECT_TIMEOUT_MS = 45_000;

/**
 * Reject a connect that never settles. A wallet whose popup fails to open
 * leaves `eth_requestAccounts` pending forever; without this the modal spins
 * with no way out and no explanation.
 */
function withConnectTimeout<T>(pending: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `${label} did not respond within ${CONNECT_TIMEOUT_MS / 1000}s. ` +
            `This usually means several wallet extensions are competing for the ` +
            `connection: open Rabby → "Set Rabby as default wallet", or disable ` +
            `your other wallet extensions, then reload and try again.`,
        ),
      );
    }, CONNECT_TIMEOUT_MS);
    pending.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/**
 * Stock RainbowKit Rabby only checks window.ethereum.isRabby. Phantom / Backpack
 * steal that object, so installed snapshots to false and the modal opens
 * "Add to Chrome". Resolve Rabby at connect time; never freeze installed false.
 */
export function detectedRabbyWallet(): Wallet {
  ensureEip6963Rabby();
  const baseWallet = rabbyWallet();
  return {
    ...baseWallet,
    rdns: RABBY_RDNS,
    /**
     * Deliberately a getter, not a snapshot. RainbowKit reads `installed` when
     * it renders the modal, and by then EIP-6963 discovery has run. A plain
     * boolean would freeze at module load — before a late-announcing Rabby is
     * visible — and the modal would offer a connect that can only hang. Saying
     * `false` when Rabby truly is not there sends the user to the install
     * screen instead of a dead spinner.
     */
    get installed(): boolean {
      return getRabbyProvider() !== undefined;
    },
    createConnector: (walletDetails: WalletDetailsParams) =>
      createConnector((config) => {
        const base = injected({
          /**
           * Never return undefined here. wagmi's injected() reads a falsy
           * target as "no target configured" and falls back to
           * window.ethereum, so a missing Rabby would silently open whichever
           * wallet owns that object (Core, MetaMask, …) under Rabby's name.
           * Resolve the provider lazily and let connect() fail loudly with
           * ProviderNotFoundError instead.
           */
          target() {
            if (process.env.NODE_ENV !== "production") debugInjectedWallets();
            return {
              id: "rabby",
              name: "Rabby Wallet",
              provider: () => getRabbyProvider(),
            };
          },
        })(config);
        return {
          ...base,
          ...walletDetails,
          /**
           * Race the connect against a deadline. With several wallet
           * extensions installed, a competing inpage provider can swallow the
           * request and Rabby's popup never opens — the promise then never
           * settles and the modal spins on "Opening Rabby Wallet…" forever
           * (rainbow-me/rainbowkit#2534). Rejecting hands control back to the
           * user with advice instead of a dead spinner.
           */
          async connect<withCapabilities extends boolean = false>(
            params: Parameters<typeof base.connect<withCapabilities>>[0],
          ) {
            return withConnectTimeout(
              base.connect<withCapabilities>(params),
              "Rabby",
            );
          },
        };
      }),
  };
}
