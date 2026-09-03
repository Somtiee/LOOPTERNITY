"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  getPlayer,
  registerPlayer,
  syncWalletNormalBests,
} from "@/web3/p2e/store";
import type { PlayerProfile } from "@/web3/p2e/types";

export function usePlayerRegistry() {
  const { address, isConnected } = useAccount();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);

  const refresh = useCallback(() => {
    if (address) setProfile(getPlayer(address));
    else setProfile(null);
  }, [address]);

  useEffect(() => {
    if (!isConnected || !address) {
      setProfile(null);
      return;
    }
    registerPlayer(address);
    refresh();
    void syncWalletNormalBests(address).then(() => refresh());
  }, [address, isConnected, refresh]);

  return {
    address,
    isConnected,
    profile,
    refresh,
  };
}
