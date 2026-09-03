"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useSwitchChain } from "wagmi";
import {
  ROBINHOOD_CHAIN,
  CHAIN_LABEL,
  CHAIN_SWITCH_LABEL,
} from "@/web3/config";

type ConnectWalletButtonProps = {
  className?: string;
  /** Compact for HUD / game-over; full for main menu */
  size?: "sm" | "md";
};

function truncateAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ConnectWalletButton({
  className = "",
  size = "md",
}: ConnectWalletButtonProps) {
  const pad = size === "sm" ? "px-3 py-2 text-[10px]" : "px-4 py-2.5 text-xs";
  const { switchChainAsync } = useSwitchChain();

  const shell = `inline-flex min-h-11 items-center justify-center rounded-xl border font-[family-name:var(--font-display)] tracking-[0.16em] transition active:scale-[0.98] ${pad}`;

  return (
    <div className={`pointer-events-auto ${className}`}>
      <ConnectButton.Custom>
        {({
          account,
          chain,
          openAccountModal,
          openChainModal,
          openConnectModal,
          mounted,
        }) => {
          const restoring = !mounted;

          if (restoring && !account) {
            return (
              <button
                type="button"
                disabled
                aria-label="Reconnecting wallet"
                className={`${shell} cursor-wait border-[#00C805]/40 bg-[#00C805]/20 text-[#7CFF7C]`}
              >
                …
              </button>
            );
          }

          if (!account || !chain) {
            return (
              <button
                type="button"
                onClick={openConnectModal}
                className={`${shell} border-[#00C805]/80 bg-[#00C805] text-[#05140a] hover:brightness-110`}
              >
                CONNECT WALLET
              </button>
            );
          }

          if (chain.unsupported || chain.id !== ROBINHOOD_CHAIN.id) {
            return (
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      await switchChainAsync({ chainId: ROBINHOOD_CHAIN.id });
                    } catch {
                      openChainModal();
                    }
                  })();
                }}
                className={`${shell} border-red-400/50 bg-red-500/20 tracking-[0.12em] text-red-100 hover:bg-red-500/30`}
              >
                WRONG NETWORK · {CHAIN_SWITCH_LABEL}
              </button>
            );
          }

          return (
            <button
              type="button"
              onClick={openAccountModal}
              className={`${shell} border-[#00C805]/45 bg-[#00C805]/15 tracking-[0.12em] text-[#7CFF7C] hover:bg-[#00C805]/25`}
              title={`${account.address} · ${chain.name ?? CHAIN_LABEL}`}
            >
              {truncateAddress(account.address)}
              <span className="ml-2 font-sans tracking-[0.08em] opacity-75">
                {chain.name ?? CHAIN_LABEL}
              </span>
            </button>
          );
        }}
      </ConnectButton.Custom>
    </div>
  );
}
