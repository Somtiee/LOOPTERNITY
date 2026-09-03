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

function ensureEip6963Rabby() {
  if (typeof window === "undefined" || listening) return;
  listening = true;
  window.addEventListener(
    "eip6963:announceProvider",
    ((event: Event) => {
      const detail = (
        event as CustomEvent<{
          info?: { rdns?: string };
          provider?: EIP1193Provider;
        }>
      ).detail;
      if (detail?.info?.rdns === RABBY_RDNS && detail.provider) {
        eip6963Rabby = detail.provider;
      }
    }) as EventListener,
  );
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

if (typeof window !== "undefined") {
  ensureEip6963Rabby();
}

/** Rabby's own provider — never assume it is window.ethereum. */
export function getRabbyProvider(): EIP1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  ensureEip6963Rabby();
  const w = window as Window & {
    rabby?: EIP1193Provider;
    ethereum?: RabbyWindowProvider & {
      providers?: RabbyWindowProvider[];
    };
  };
  if (w.rabby) return w.rabby;
  if (w.ethereum?.isRabby) return w.ethereum;
  const fromList = w.ethereum?.providers?.find(
    (p: RabbyWindowProvider) => p.isRabby === true,
  );
  if (fromList) return fromList;
  return eip6963Rabby;
}

/**
 * Stock RainbowKit Rabby only checks window.ethereum.isRabby. Phantom / Backpack
 * steal that object, so installed snapshots to false and the modal opens
 * "Add to Chrome". Resolve Rabby at connect time; never freeze installed false.
 */
export function detectedRabbyWallet(): Wallet {
  ensureEip6963Rabby();
  const base = rabbyWallet();
  return {
    ...base,
    rdns: RABBY_RDNS,
    installed: getRabbyProvider() ? true : undefined,
    createConnector: (walletDetails: WalletDetailsParams) =>
      createConnector((config) => ({
        ...injected({
          target() {
            const provider = getRabbyProvider();
            if (!provider) return undefined;
            return { id: "rabby", name: "Rabby Wallet", provider };
          },
        })(config),
        ...walletDetails,
      })),
  };
}
