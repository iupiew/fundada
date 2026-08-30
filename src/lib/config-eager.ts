import { env } from "$env/dynamic/public";

type FundadaNetwork = "mainnet" | "preprod" | "preview";

// @cardano-sdk/core NetworkId: Mainnet = 1, Testnet = 0.
// All testnets (preprod/preview) share the testnet id.
const NETWORK_IDS: Record<FundadaNetwork, number> = {
  mainnet: 1,
  preprod: 0,
  preview: 0,
};

const isNetwork = (value: string | undefined): value is FundadaNetwork =>
  value === "mainnet" || value === "preprod" || value === "preview";

const projectId = env.PUBLIC_FUNDADA_BLOCKFROST_PROJECT_ID?.trim();
if (!projectId) {
  throw new Error(
    "PUBLIC_FUNDADA_BLOCKFROST_PROJECT_ID is not set. Copy .env.example to .env and add your Blockfrost project ID (https://blockfrost.io).",
  );
}

function networkFromProjectId(id: string): FundadaNetwork {
  const prefix = id.slice(0, 7);
  if (isNetwork(prefix)) return prefix;
  throw new Error(
    `Cannot infer network from Blockfrost project ID "${id}". The prefix must be one of: mainnet, preprod, preview.`,
  );
}

function resolveNetwork(configured: string | undefined, id: string): FundadaNetwork {
  const fromProject = networkFromProjectId(id);
  if (!configured) return fromProject;
  if (!isNetwork(configured)) {
    throw new Error(
      `PUBLIC_FUNDADA_NETWORK must be one of: mainnet, preprod, preview (got "${configured}").`,
    );
  }
  if (configured !== fromProject) {
    throw new Error(
      `PUBLIC_FUNDADA_NETWORK="${configured}" conflicts with the Blockfrost project ID prefix "${fromProject}".`,
    );
  }
  return configured;
}

export const NETWORK: FundadaNetwork = resolveNetwork(
  env.PUBLIC_FUNDADA_NETWORK?.trim(),
  projectId,
);
export const NETWORK_ID = NETWORK_IDS[NETWORK];

/** Thread token name: "FUNDADA" (hex), shared by every campaign. */
export const TOKEN_NAME = "46554e44414441";
