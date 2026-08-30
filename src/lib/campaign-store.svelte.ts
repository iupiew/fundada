export interface Campaign {
  campaignId: string; // thread token policy id
  title: string;
  description: string;
  goalLovelace: number;
  deadline: number; // POSIX ms
  founderPkh: string;
  links: string;
  createdAt: number;
}

const STORAGE_KEY = "fundada.campaign.v2";

function load(): Campaign | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Campaign;
    // Guard against the pre-thread-token v1 shape.
    if (!parsed.campaignId) return null;
    return parsed;
  } catch {
    return null;
  }
}

let campaign: Campaign | null = $state(load());

export const CampaignStore = {
  get campaign() {
    return campaign;
  },
  set(next: Campaign) {
    campaign = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — keep in-memory only
    }
  },
  clear() {
    campaign = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  },
};
