import type { UTxO } from "@meshsdk/core";
import type { CampaignHead } from "$lib/fundada.js";
import { CampaignStore } from "$lib/campaign-store.svelte.js";

type FundadaModule = typeof import("$lib/fundada.js");
let fundadaPromise: Promise<FundadaModule> | null = null;
function getFundada(): Promise<FundadaModule> {
  if (!fundadaPromise) fundadaPromise = import("$lib/fundada.js");
  return fundadaPromise;
}

export type CampaignStatus = "active" | "funded" | "missed";

export interface OnChainCampaign {
  /** Thread token policy id — unique per campaign. */
  campaignId: string;
  founderPkh: string;
  goalLovelace: bigint;
  deadline: number; // POSIX ms
  pledgedLovelace: bigint;
  pledgeCount: number;
  metGoal: boolean;
  title: string;
  description: string;
  /** Raw utf-8 links payload from the datum (JSON array convention). */
  links: string;
}

export function campaignStatus(c: OnChainCampaign, now = Date.now()): CampaignStatus {
  if (c.metGoal) return "funded";
  if (now > c.deadline) return "missed";
  return "active";
}

export function shortPkh(pk: string): string {
  return `${pk.slice(0, 6)}…${pk.slice(-4)}`;
}

export function toOnChainCampaign(utxo: UTxO, head: CampaignHead): OnChainCampaign {
  return {
    campaignId: head.campaignId,
    founderPkh: head.founderPkh,
    goalLovelace: head.goalLovelace,
    deadline: Number(head.deadline),
    pledgedLovelace: head.pledges.reduce((acc, p) => acc + p.amount, 0n),
    pledgeCount: head.pledges.length,
    metGoal: head.metGoal,
    title: head.title || `Campaign by ${shortPkh(head.founderPkh)}`,
    description: head.description,
    links: head.links,
  };
}

/** Every live campaign head at the script address. */
export async function fetchCampaigns(): Promise<OnChainCampaign[]> {
  const { fetchScriptUtxos, isHeadUtxo, parseHeadDatum } = await getFundada();
  const utxos = await fetchScriptUtxos();
  const campaigns: OnChainCampaign[] = [];
  for (const utxo of utxos) {
    if (!isHeadUtxo(utxo)) continue;
    const head = parseHeadDatum(utxo);
    if (!head) continue;
    campaigns.push(toOnChainCampaign(utxo, head));
  }
  // Newest deadline first
  campaigns.sort((a, b) => b.deadline - a.deadline);
  return campaigns;
}

/** Resolve a campaign by id, falling back to the locally stored one. */
export async function resolveCampaign(
  campaignId?: string | null,
): Promise<{ utxo: UTxO; head: CampaignHead; info: OnChainCampaign } | null> {
  const id = campaignId || CampaignStore.campaign?.campaignId;
  if (!id) return null;
  const { getHead } = await getFundada();
  const found = await getHead(id);
  if (!found) return null;
  return { ...found, info: toOnChainCampaign(found.utxo, found.head) };
}

export function defaultTitle(c: OnChainCampaign): string {
  return `Campaign by ${shortPkh(c.founderPkh)}`;
}

export function formatAda(lovelace: bigint | number): string {
  return (Number(lovelace) / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
