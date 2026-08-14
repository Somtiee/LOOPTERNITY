"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  getPlayer,
  listPlayers,
  registerPlayer,
  weeklyStandings,
} from "@/web3/p2e/store";
import { msUntilWeekEnd, sealedThemeForWeek, weekIdFromDate } from "@/web3/p2e/week";
import type { PlayerProfile, WeekState } from "@/web3/p2e/types";
import type { OfficialBoardRow, RankedWallet } from "@/web3/p2e/ranking";
import { vaultIsDeployed } from "@/web3/config";
import { useOnchainWeekTheme } from "@/web3/hooks/useOnchainWeekTheme";
import { useVerifiedP2EBoard } from "@/web3/hooks/useVerifiedP2EBoard";
import type { VerifiedSubmitter } from "@/web3/p2e/verifiedCache";

export function usePlayerRegistry() {
  const { address, isConnected } = useAccount();
  const p2eWorld = useOnchainWeekTheme();
  const weekId = vaultIsDeployed
    ? p2eWorld.weekId
    : weekIdFromDate();
  const verified = useVerifiedP2EBoard(weekId);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [week, setWeek] = useState<WeekState | null>(null);
  const [ranked, setRanked] = useState<RankedWallet[]>([]);
  const [players, setPlayers] = useState<PlayerProfile[]>([]);
  const [msLeft, setMsLeft] = useState(0);

  const refreshLocal = useCallback(() => {
    const standings = weeklyStandings();
    setWeek(standings.week);
    setRanked(vaultIsDeployed ? [] : standings.ranked);
    setPlayers(listPlayers());
    const id = weekId ?? standings.week.weekId;
    setMsLeft(msUntilWeekEnd(id));
    if (address) setProfile(getPlayer(address));
    else setProfile(null);
  }, [address, weekId]);

  const refetchVerified = verified.refetch;
  const refresh = useCallback(() => {
    refreshLocal();
    if (vaultIsDeployed) void refetchVerified();
  }, [refreshLocal, refetchVerified]);

  useEffect(() => {
    if (isConnected && address) registerPlayer(address);
    refreshLocal();
  }, [address, isConnected, refreshLocal]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const wid = weekId ?? week?.weekId;
      if (wid) setMsLeft(msUntilWeekEnd(wid));
    }, 30_000);
    return () => window.clearInterval(id);
  }, [week, weekId]);

  const officialBoard: OfficialBoardRow[] = vaultIsDeployed
    ? verified.officialBoard
    : [];

  const submitters: VerifiedSubmitter[] = vaultIsDeployed
    ? verified.submitters
    : ranked.map((r) => ({ address: r.address, runCount: r.runs }));

  const myAddr = address?.toLowerCase();
  const myRankIndex = myAddr
    ? (vaultIsDeployed && verified.attested
        ? verified.officialBoard.findIndex(
            (r) => r.address.toLowerCase() === myAddr,
          )
        : vaultIsDeployed
          ? -1
          : ranked.findIndex((r) => r.address.toLowerCase() === myAddr))
    : -1;

  const fallbackWeekId = weekIdFromDate();
  const liveWeek: WeekState = {
    ...(week ?? {
      weekId: fallbackWeekId,
      themeId: sealedThemeForWeek(fallbackWeekId),
      poolWei: "0",
      treasuryAccruedWei: "0",
      settled: false,
      runs: [],
      payouts: [],
    }),
    weekId: weekId ?? week?.weekId ?? fallbackWeekId,
    poolWei: vaultIsDeployed ? verified.poolWei : (week?.poolWei ?? "0"),
    settled: vaultIsDeployed ? verified.settled : Boolean(week?.settled),
  };

  return {
    address,
    isConnected,
    profile,
    week: liveWeek,
    ranked: vaultIsDeployed ? [] : ranked,
    officialBoard,
    submitters,
    attested: vaultIsDeployed ? verified.attested : false,
    boardSource: vaultIsDeployed ? verified.source : ("local" as const),
    boardLoading: vaultIsDeployed && verified.loading,
    boardError: vaultIsDeployed ? verified.error : null,
    myRank:
      myRankIndex >= 0
        ? vaultIsDeployed
          ? verified.officialBoard[myRankIndex]
          : ranked[myRankIndex]
        : undefined,
    myRankIndex,
    players,
    msLeft,
    refresh,
  };
}
