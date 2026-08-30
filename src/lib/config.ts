import { env } from "$env/dynamic/public";
import {
  applyParamsToScript,
  BlockfrostProvider,
  resolvePlutusScriptAddress,
} from "@meshsdk/core";
import blueprint from "$lib/blueprint.json";
import { NETWORK, NETWORK_ID, TOKEN_NAME } from "$lib/config-eager";

export { NETWORK, NETWORK_ID, TOKEN_NAME };

const projectId = env.PUBLIC_FUNDADA_BLOCKFROST_PROJECT_ID?.trim()!;

const baseUrl = env.PUBLIC_FUNDADA_BLOCKFROST_URL?.trim();
export const provider = baseUrl
  ? new BlockfrostProvider(baseUrl)
  : new BlockfrostProvider(projectId);

interface Blueprint {
  validators: { title: string; compiledCode: string; hash: string }[];
}

const bp = blueprint as unknown as Blueprint;

const spendRaw = bp.validators.find((v) => v.title === "campaign.campaign.spend")!
  .compiledCode;
const mintRaw = bp.validators.find((v) => v.title === "campaign.one_shot_mint.mint")!
  .compiledCode;

// applyParamsToScript normalizes a compiled script into the double-wrapped
// form whose hash matches Aiken's `hash` (and what the node expects as a
// witness). Using the raw compiledCode here would lock/serve the head at the
// WRONG script address (a different, malformed hash).
export const SCRIPT_CBOR = applyParamsToScript(spendRaw, [1], "Mesh");
export const MINT_CBOR = mintRaw;

export const SCRIPT_ADDRESS = resolvePlutusScriptAddress(
  { code: SCRIPT_CBOR, version: "V3" },
  NETWORK_ID,
);
