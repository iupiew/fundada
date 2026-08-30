import {
  BrowserWallet,
  deserializeDatum,
  resolvePaymentKeyHash,
  SLOT_CONFIG_NETWORK,
  unixTimeToEnclosingSlot,
  MeshTxBuilder,
  applyParamsToScript,
  resolveScriptHash,
  getOutputMinLovelace,
} from "@meshsdk/core";
import type { UTxO, Data, Asset, Output } from "@meshsdk/core";
import {
  NETWORK,
  provider,
  SCRIPT_ADDRESS,
  SCRIPT_CBOR,
  MINT_CBOR,
  TOKEN_NAME,
} from "$lib/config";

let protocolParams: Awaited<ReturnType<typeof provider.fetchProtocolParameters>> | null =
  null;

async function getProtocolParams() {
  if (!protocolParams) {
    console.debug("[fundada] fetching protocol parameters…");
    const t = performance.now();
    protocolParams = await withTimeout(
      provider.fetchProtocolParameters(),
      30_000,
      "Fetching protocol parameters",
    );
    console.debug(
      `[fundada] protocol parameters fetched in ${Math.round(performance.now() - t)}ms`,
    );
  }
  return protocolParams;
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Blockfrost's /utils/txs/evaluate endpoint cannot evaluate Plutus ex-units
 * for our scripts (it answers with an Ogmios EvaluationFailure carrying no
 * script details), so — like contracts/scripts/test-fundada.mjs — we provide
 * a generous manual budget instead of wiring an evaluator into the builder.
 * (The validator itself uses ~150k mem / ~47M steps per aiken check.)
 */
const EX_UNITS: { mem: number; steps: number } = { mem: 1_000_000, steps: 500_000_000 };

// No `evaluator` on purpose — see EX_UNITS.
async function newTxBuilder() {
  return new MeshTxBuilder({
    fetcher: provider,
    submitter: provider,
    params: await getProtocolParams(),
  });
}

/**
 * Safety margin over the canonical min-UTxO to absorb any byte-size drift
 * between our reconstructed {@link Output} and what the node serializes
 * (e.g. minor datum-wrapper shape differences). Costs ~0.2 ADA locked per
 * head UTxO — negligible against campaign pledges.
 */
const MIN_ADA_MARGIN = 200_000n;

/**
 * Compute the lovelace required to satisfy the Babbage min-UTxO rule for a
 * campaign head output (script address + thread token + 9-field inline datum),
 * plus a small safety margin.
 *
 * Uses Mesh's canonical formula
 * `(160 + serializedOutputBytes) * coinsPerUtxoSize`, iterated up to 3× to
 * absorb variable-length coin encoding. Recomputed per-tx from live protocol
 * params so it stays correct as the datum grows (pledges) or shrinks
 * (refunds) and if `coinsPerUtxoSize` ever changes.
 *
 * @param amount  Tentative asset list (lovelace entry may be a placeholder).
 * @param datum   The Mesh "Mesh" data that will be attached as an inline datum.
 * @returns       `max(computedMinAda + margin, 0)` as lovelace.
 */
async function minAdaForHeadOutput(amount: Asset[], datum: Data): Promise<bigint> {
  const { coinsPerUtxoSize } = await getProtocolParams();
  const output: Output = {
    address: SCRIPT_ADDRESS,
    amount,
    datum: { type: "Inline", data: { type: "Mesh", content: datum } },
  };
  return getOutputMinLovelace(output, coinsPerUtxoSize) + MIN_ADA_MARGIN;
}

// ─── Campaign head datum ────────────────────────────────────────────────────

export interface Pledge {
  backer: string; // hex pubkey hash (28 bytes)
  amount: bigint; // lovelace
}

export interface CampaignHead {
  founderPkh: string;
  goalLovelace: bigint;
  deadline: bigint; // POSIX time in ms
  campaignId: string; // minting policy id = thread token policy
  metGoal: boolean;
  pledges: Pledge[];
  title: string; // utf-8
  description: string; // utf-8
  links: string; // utf-8
}

const utf8ToHex = (s: string): string =>
  Array.from(new TextEncoder().encode(s))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const hexToUtf8 = (h: string): string => {
  if (!h) return "";
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(bytes);
};

function meshBool(b: boolean): Data {
  return { alternative: b ? 1 : 0, fields: [] };
}

/** Build the 9-field head datum in Mesh's "Mesh" data format. */
export function buildHeadDatum(head: {
  founderPkh: string;
  goalLovelace: bigint | number;
  deadline: bigint | number;
  campaignId: string;
  metGoal: boolean;
  pledges: { backer: string; amount: bigint | number }[];
  title: string;
  description: string;
  links: string;
}): Data {
  return {
    alternative: 0,
    fields: [
      head.founderPkh,
      Number(head.goalLovelace),
      Number(head.deadline),
      head.campaignId,
      meshBool(head.metGoal),
      head.pledges.map((p) => ({
        alternative: 0,
        fields: [p.backer, Number(p.amount)],
      })),
      utf8ToHex(head.title),
      utf8ToHex(head.description),
      utf8ToHex(head.links),
    ],
  };
}

/** Parse the inline datum of a campaign head UTxO, or null if unparseable. */
export function parseHeadDatum(utxo: UTxO): CampaignHead | null {
  const raw = utxo.output.plutusData;
  if (!raw) return null;
  try {
    const data = deserializeDatum(raw);
    const alt =
      typeof data.constructor === "bigint"
        ? data.constructor
        : BigInt(data.constructor as string | number);
    if (alt !== 0n || !Array.isArray(data.fields) || data.fields.length !== 9)
      return null;
    const [founder, goal, deadline, campaignId, metGoal, pledges, title, description, links] =
      data.fields;
    if (!founder.bytes || !campaignId.bytes) return null;
    return {
      founderPkh: founder.bytes,
      goalLovelace: BigInt(goal.int),
      deadline: BigInt(deadline.int),
      campaignId: campaignId.bytes,
      metGoal: Number(metGoal.constructor) === 1,
      pledges: (pledges.list ?? []).map((p: { fields: { bytes: string; int: number | bigint }[] }) => ({
        backer: p.fields[0].bytes,
        amount: BigInt(p.fields[1].int),
      })),
      title: hexToUtf8(title.bytes ?? ""),
      description: hexToUtf8(description.bytes ?? ""),
      links: hexToUtf8(links.bytes ?? ""),
    };
  } catch {
    return null;
  }
}

export function totalPledged(head: CampaignHead): bigint {
  return head.pledges.reduce((acc, p) => acc + p.amount, 0n);
}

// ─── UTxO helpers ───────────────────────────────────────────────────────────

export function lovelaceOf(utxo: UTxO): bigint {
  const asset = utxo.output.amount.find((a) => a.unit === "lovelace");
  return BigInt(asset ? asset.quantity : 0);
}

export function sumLovelace(utxos: UTxO[]): bigint {
  return utxos.reduce((acc, utxo) => acc + lovelaceOf(utxo), 0n);
}

export async function fetchScriptUtxos(): Promise<UTxO[]> {
  return provider.fetchAddressUTxOs(SCRIPT_ADDRESS);
}

const sameRef = (a: UTxO, b: UTxO) =>
  a.input.txHash === b.input.txHash &&
  a.input.outputIndex === b.input.outputIndex;

/** A UTxO is a campaign head if it carries exactly 1 thread token. */
export function isHeadUtxo(utxo: UTxO): boolean {
  return utxo.output.amount.some(
    (a) => a.unit.endsWith(TOKEN_NAME) && a.unit.length > TOKEN_NAME.length && String(a.quantity) === "1",
  );
}

export function headTokenUnit(campaignId: string): string {
  return campaignId + TOKEN_NAME;
}

/** Find the live head UTxO of a campaign (retries while Blockfrost lags). */
export async function getHeadUtxo(
  campaignId: string,
  attempts = 12,
): Promise<UTxO | null> {
  const unit = headTokenUnit(campaignId);
  for (let i = 0; i < attempts; i++) {
    const utxos = await fetchScriptUtxos();
    const head = utxos.find(
      (u) => String(u.output.amount.find((a) => a.unit === unit)?.quantity) === "1",
    );
    if (head) return head;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

/** Fetch the head UTxO and its parsed datum for a campaign. */
export async function getHead(campaignId: string): Promise<{ utxo: UTxO; head: CampaignHead } | null> {
  const utxo = await getHeadUtxo(campaignId, 1);
  if (!utxo) return null;
  const head = parseHeadDatum(utxo);
  if (!head) return null;
  return { utxo, head };
}

export async function getPkh(wallet: BrowserWallet): Promise<string> {
  return resolvePaymentKeyHash(await wallet.getChangeAddress());
}

// ─── Slots ──────────────────────────────────────────────────────────────────

/**
 * Slot strictly after the deadline, with a safety buffer: testnet slot clocks
 * can lag wall-clock time by a minute or more, so a tx whose invalidBefore is
 * only one slot past the deadline can land OutsideValidityInterval.
 */
export function slotAfterDeadline(deadlineMs: bigint | number): number {
  return unixTimeToEnclosingSlot(Number(deadlineMs), SLOT_CONFIG_NETWORK[NETWORK]) + 120;
}

/** Slot comfortably before the deadline, used as a pledge tx's upper bound. */
export function slotBeforeDeadline(deadlineMs: bigint | number): number {
  return unixTimeToEnclosingSlot(Number(deadlineMs), SLOT_CONFIG_NETWORK[NETWORK]) - 1;
}

/** Wall-clock time when claiming becomes possible (deadline + slot buffer). */
export function claimableAtMs(deadlineMs: bigint | number): number {
  return Number(deadlineMs) + 180_000;
}

// ─── Collateral & spendable balance ─────────────────────────────────────────

/** Fee headroom (size + script/redeemer costs) a payment pool must keep beyond the payment. */
const FEE_BUFFER = 500_000n; // ~0.5 ADA
/** Min-UTxO rule for the change output paid back to the wallet. */
const MIN_CHANGE = 1_100_000n; // ~1.1 ADA
/** Size of the dedicated collateral UTxO carved when no existing UTxO is viable. */
const CARVE_COLLATERAL = 2_000_000n; // 2 ADA — covers 150% of any fee here

/** A UTxO is usable as collateral if it is pure ADA with no datum/script reference. */
function isPureAdaUtxo(utxo: UTxO): boolean {
  return (
    utxo.output.amount.length === 1 &&
    utxo.output.amount[0]?.unit === "lovelace" &&
    !utxo.output.plutusData &&
    !utxo.output.dataHash &&
    !utxo.output.scriptRef
  );
}

const adaText = (lovelace: bigint): string =>
  (Number(lovelace) / 1_000_000).toFixed(2);

let cachedCollateral: UTxO | null = null;

/**
 * Reserve a collateral UTxO for a script transaction while guaranteeing the
 * remaining payment UTxOs can cover `neededLovelace` plus fees and the
 * minimum-change output. Without this, the cardano-sdk selector fails with
 * opaque "UTxO Balance Insufficient" / "UTxO Fully Depleted" errors whenever
 * the collateral reservation starves the payment pool.
 *
 * Priority:
 * 1. Cached or CIP-40 wallet-registered collateral, if the rest still covers the payment.
 * 2. The smallest pure-ADA UTxO (≥ 2 ADA) whose exclusion leaves enough to pay.
 * 3. Carve a dedicated 2 ADA collateral with a self-send and retry.
 * 4. Otherwise: clear error stating how much is actually spendable.
 */
export async function ensureSpendableCollateral(
  wallet: BrowserWallet,
  neededLovelace: bigint,
): Promise<{ collateral: UTxO; paymentUtxos: UTxO[] }> {
  const required = neededLovelace + FEE_BUFFER + MIN_CHANGE;
  const utxos = await wallet.getUtxos();
  if (utxos.length === 0) throw new Error("Wallet has no UTxOs to spend.");

  const viable = (
    collateral: UTxO,
    pool: UTxO[] = utxos,
  ): { collateral: UTxO; paymentUtxos: UTxO[] } | null => {
    const paymentUtxos = pool.filter((u) => !sameRef(u, collateral));
    if (sumLovelace(paymentUtxos) >= required) return { collateral, paymentUtxos };
    return null;
  };

  // 1a. Reuse a previously reserved collateral UTxO.
  if (cachedCollateral) {
    const current = utxos.find((u) => sameRef(u, cachedCollateral!));
    if (current) {
      const option = viable(current);
      if (option) return option;
    }
    cachedCollateral = null;
  }

  // 1b. Collateral registered by the wallet itself (CIP-40).
  const registered = (await wallet.getCollateral())[0];
  if (registered) {
    const option = viable(registered);
    if (option) {
      cachedCollateral = registered;
      return option;
    }
  }

  // 2. Smallest pure-ADA UTxO whose exclusion keeps the payment covered.
  const candidates = utxos
    .filter((u) => isPureAdaUtxo(u) && lovelaceOf(u) >= CARVE_COLLATERAL)
    .sort((a, b) => Number(lovelaceOf(a) - lovelaceOf(b)));
  for (const candidate of candidates) {
    const option = viable(candidate);
    if (option) {
      cachedCollateral = candidate;
      return option;
    }
  }

  // 3. No existing UTxO works — carve a dedicated 2 ADA collateral if the
  //    total balance can afford the split (this costs one extra wallet
  //    signature for the self-send).
  const total = sumLovelace(utxos);
  if (total >= required + CARVE_COLLATERAL + FEE_BUFFER) {
    const carved = await carveCollateral(wallet, utxos);
    if (carved) {
      const fresh = await wallet.getUtxos();
      const option = viable(carved, fresh);
      if (option) {
        cachedCollateral = carved;
        return option;
      }
    }
  }

  // 4. Give up with numbers instead of selector jargon. The estimate reserves
  //    a 2 ADA collateral plus fees for both a potential carve and the action.
  const maxSpendable =
    total > CARVE_COLLATERAL + 2n * FEE_BUFFER + MIN_CHANGE
      ? total - CARVE_COLLATERAL - 2n * FEE_BUFFER - MIN_CHANGE
      : 0n;
  throw new Error(
    `Not enough spendable ADA — after reserving a ₳${adaText(CARVE_COLLATERAL)} collateral input, ` +
      `transaction fees, and the minimum change output, this wallet can spend at most about ` +
      `₳${adaText(maxSpendable)}, but this action needs ₳${adaText(neededLovelace)}. ` +
      `The wallet's displayed balance includes UTxOs that must stay reserved. ` +
      `Top up the wallet or lower the amount.`
  );
}

/** Self-send a dedicated 2 ADA collateral UTxO and wait for it to index. */
async function carveCollateral(
  wallet: BrowserWallet,
  utxos: UTxO[],
): Promise<UTxO | null> {
  const changeAddress = await wallet.getChangeAddress();
  const tx = await newTxBuilder();
  const unsigned = await tx
    .setNetwork(NETWORK)
    .changeAddress(changeAddress)
    .txOut(changeAddress, [{ unit: "lovelace", quantity: String(CARVE_COLLATERAL) }])
    .selectUtxosFrom(utxos)
    .complete();

  const signed = await wallet.signTx(unsigned, true);
  const carveHash = await wallet.submitTx(signed);
  await waitForTx(wallet, carveHash);

  // Blockfrost can lag; poll until the freshly carved UTxO shows up.
  for (let i = 0; i < 10; i++) {
    const fresh = await wallet.getUtxos();
    const carved = fresh.find(
      (u) =>
        isPureAdaUtxo(u) &&
        lovelaceOf(u) === CARVE_COLLATERAL &&
        !utxos.some((o) => sameRef(o, u)),
    );
    if (carved) return carved;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

/**
 * Approximate maximum lovelace the wallet can pay in one script transaction —
 * total balance minus the collateral reservation, fee headroom, and min change.
 */
export async function maxPledgeableLovelace(wallet: BrowserWallet): Promise<bigint> {
  const utxos = await wallet.getUtxos();
  if (utxos.length === 0) return 0n;
  const total = sumLovelace(utxos);
  const registered = (await wallet.getCollateral())[0];
  const reserve =
    registered && utxos.some((u) => sameRef(u, registered))
      ? lovelaceOf(registered)
      : CARVE_COLLATERAL;
  const usable = total - reserve - FEE_BUFFER - MIN_CHANGE;
  return usable > 0n ? usable : 0n;
}

/** Wait until Blockfrost has indexed `txHash` (its outputs show up as UTxOs). */
export async function waitForTx(
  wallet: BrowserWallet,
  txHash: string,
  attempts = 40,
  delay = 3000,
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    const utxos = await wallet.getUtxos();
    if (utxos.some((u) => u.input.txHash === txHash)) return true;
    await new Promise((r) => setTimeout(r, delay));
  }
  console.warn(`[fundada] waitForTx timed out for ${txHash}`);
  return false;
}

// ─── Transactions ───────────────────────────────────────────────────────────

/**
 * Create a campaign: mint the one-shot thread token and lock the head UTxO
 * (seed pledge + token + 9-field datum) at the campaign script address.
 */
export async function buildCreateCampaignTx(
  wallet: BrowserWallet,
  opts: {
    goalLovelace: number;
    deadlineMs: number;
    title: string;
    description: string;
    links?: string;
    seedLovelace: number;
  },
): Promise<{ txHex: string; campaignId: string; founderPkh: string }> {
  // Reserve collateral while guaranteeing the payment pool covers the seed
  // pledge (may carve a dedicated collateral UTxO via a self-send first).
  // Reserve a bit more than the requested seed: the head output's actual
  // lovelace is padded up to the min-UTxO after we know the campaign id
  // (which depends on the seed UTxO picked below), so we over-reserve here
  // by a safe upper bound and reconcile after the exact min-UTxO is known.
  const headLovelaceUpperBound = BigInt(opts.seedLovelace) + 1_000_000n;
  const { collateral, paymentUtxos } = await ensureSpendableCollateral(
    wallet,
    headLovelaceUpperBound,
  );
  if (paymentUtxos.length === 0) throw new Error("Wallet has no UTxOs");

  const seed =
    paymentUtxos.find((u) => !u.output.plutusData && !u.output.dataHash) ??
    paymentUtxos[0];

  // Parametrize the one-shot minting policy with the seed UTxO reference and
  // derive the campaign id (= thread token policy id) from the applied script.
  const seedParam: Data = {
    alternative: 0,
    fields: [seed.input.txHash, seed.input.outputIndex],
  };
  const appliedMint = applyParamsToScript(MINT_CBOR, [seedParam], "Mesh");
  const campaignId = resolveScriptHash(appliedMint, "V3");

  const founderPkh = await getPkh(wallet);
  const datum = buildHeadDatum({
    founderPkh,
    goalLovelace: opts.goalLovelace,
    deadline: opts.deadlineMs,
    campaignId,
    metGoal: false,
    pledges: [],
    title: opts.title,
    description: opts.description,
    links: opts.links ?? "",
  });

  const tokenUnit = headTokenUnit(campaignId);
  const changeAddress = await wallet.getChangeAddress();

  const minHeadLovelace = await minAdaForHeadOutput(
    [
      { unit: "lovelace", quantity: String(opts.seedLovelace) },
      { unit: tokenUnit, quantity: "1" },
    ],
    datum,
  );
  const headLovelace = BigInt(opts.seedLovelace) > minHeadLovelace
    ? BigInt(opts.seedLovelace)
    : minHeadLovelace;

  const tx = await newTxBuilder();
  const txHex = await completeTx(
    tx
      .setNetwork(NETWORK)
      .txIn(seed.input.txHash, seed.input.outputIndex, seed.output.amount, seed.output.address)
      .mintPlutusScriptV3()
      .mint("1", campaignId, TOKEN_NAME)
      .mintingScript(appliedMint)
      .mintRedeemerValue({ alternative: 1, fields: [] }, "Mesh", EX_UNITS)
      .txOut(SCRIPT_ADDRESS, [
        { unit: "lovelace", quantity: String(headLovelace) },
        { unit: tokenUnit, quantity: "1" },
      ])
      .txOutInlineDatumValue(datum, "Mesh")
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .changeAddress(changeAddress)
      .selectUtxosFrom(paymentUtxos.filter((u) => !sameRef(u, seed))),
    "create-campaign transaction",
  );

  return { txHex, campaignId, founderPkh };
}

/**
 * Pledge (or top up): spend the head with MakePledge, add the backer's
 * contribution to the head value and relock with the updated pledge list.
 * Must happen strictly before the deadline.
 */
export async function buildPledgeTx(
  wallet: BrowserWallet,
  campaignId: string,
  amountLovelace: number,
): Promise<string> {
  const found = await getHead(campaignId);
  if (!found) throw new Error("Campaign head not found on-chain");
  const { utxo: head, head: datum } = found;

  const backerPkh = await getPkh(wallet);
  const existing = datum.pledges.find((p) => p.backer === backerPkh);
  const pledges = existing
    ? datum.pledges.map((p) =>
        p.backer === backerPkh ? { backer: backerPkh, amount: p.amount + BigInt(amountLovelace) } : p,
      )
    : [...datum.pledges, { backer: backerPkh, amount: BigInt(amountLovelace) }];

  const newDatum = buildHeadDatum({ ...datum, metGoal: false, pledges });
  const redeemer: Data = {
    alternative: 0,
    fields: [backerPkh, amountLovelace],
  };

  const { collateral, paymentUtxos } = await ensureSpendableCollateral(
    wallet,
    BigInt(amountLovelace) + 1_000_000n,
  );
  const changeAddress = await wallet.getChangeAddress();
  const tokenUnit = headTokenUnit(campaignId);
  const headLovelace = lovelaceOf(head);

  // Ensure the relocked head meets the (possibly larger) min-UTxO for the
  // grown datum. Any top-up above headLovelace + amountLovelace is drawn from
  // the backer's payment UTxOs and stays locked in the head until withdraw.
  const tentativeHeadLovelace = headLovelace + BigInt(amountLovelace);
  const minHeadLovelace = await minAdaForHeadOutput(
    [
      { unit: "lovelace", quantity: String(tentativeHeadLovelace) },
      { unit: tokenUnit, quantity: "1" },
    ],
    newDatum,
  );
  const relockLovelace =
    tentativeHeadLovelace > minHeadLovelace ? tentativeHeadLovelace : minHeadLovelace;

  const tx = await newTxBuilder();
  return completeTx(
    tx
      .setNetwork(NETWORK)
      .spendingPlutusScriptV3()
      .txIn(head.input.txHash, head.input.outputIndex, head.output.amount, SCRIPT_ADDRESS)
      .txInScript(SCRIPT_CBOR)
      .txInInlineDatumPresent()
      .txInRedeemerValue(redeemer, "Mesh", EX_UNITS)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .txOut(SCRIPT_ADDRESS, [
        { unit: "lovelace", quantity: String(relockLovelace) },
        { unit: tokenUnit, quantity: "1" },
      ])
      .txOutInlineDatumValue(newDatum, "Mesh")
      .changeAddress(changeAddress)
      .requiredSignerHash(backerPkh)
      .invalidHereafter(slotBeforeDeadline(datum.deadline))
      .selectUtxosFrom(paymentUtxos),
    "pledge transaction",
  );
}

/**
 * Founder withdraw: after the deadline, with the goal met, pay the founder
 * every pledge and relock the head with met_goal = true.
 */
export async function buildWithdrawTx(
  wallet: BrowserWallet,
  campaignId: string,
): Promise<string> {
  const found = await getHead(campaignId);
  if (!found) throw new Error("Campaign head not found on-chain");
  const { utxo: head, head: datum } = found;

  const total = totalPledged(datum);
  if (datum.metGoal) throw new Error("Campaign funds were already withdrawn");
  if (total < datum.goalLovelace)
    throw new Error("Goal not met — the founder cannot withdraw yet");

  const newDatum = buildHeadDatum({ ...datum, metGoal: true });
  const redeemer: Data = { alternative: 1, fields: [] };

  const { collateral, paymentUtxos } = await ensureSpendableCollateral(wallet, 0n);
  const changeAddress = await wallet.getChangeAddress();
  const tokenUnit = headTokenUnit(campaignId);
  const headLovelace = lovelaceOf(head);

  // The head relocks with just enough lovelace to satisfy the min-UTxO for
  // the (unchanged-size) datum with met_goal = true. The founder receives
  // everything left over, which is always >= total_pledged because the head
  // carries the accumulated pledges plus the original seed/min-UTxO padding.
  const relockLovelace = await minAdaForHeadOutput(
    [
      { unit: "lovelace", quantity: String(headLovelace) },
      { unit: tokenUnit, quantity: "1" },
    ],
    newDatum,
  );
  if (headLovelace < relockLovelace)
    throw new Error(
      `Campaign head has insufficient ADA (₳${adaText(headLovelace)}) to relock at min-UTxO (₳${adaText(relockLovelace)}).`,
    );
  const founderPayout = headLovelace - relockLovelace;
  if (founderPayout < total)
    throw new Error(
      `Campaign head has insufficient ADA to pay all pledges (₳${adaText(total)}) while satisfying min-UTxO. ` +
        `Founder would receive only ₳${adaText(founderPayout)}.`,
    );

  const tx = await newTxBuilder();
  return completeTx(
    tx
      .setNetwork(NETWORK)
      .spendingPlutusScriptV3()
      .txIn(head.input.txHash, head.input.outputIndex, head.output.amount, SCRIPT_ADDRESS)
      .txInScript(SCRIPT_CBOR)
      .txInInlineDatumPresent()
      .txInRedeemerValue(redeemer, "Mesh", EX_UNITS)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .txOut(changeAddress, [{ unit: "lovelace", quantity: String(founderPayout) }])
      .txOut(SCRIPT_ADDRESS, [
        { unit: "lovelace", quantity: String(relockLovelace) },
        { unit: tokenUnit, quantity: "1" },
      ])
      .txOutInlineDatumValue(newDatum, "Mesh")
      .changeAddress(changeAddress)
      .requiredSignerHash(datum.founderPkh)
      .invalidBefore(slotAfterDeadline(datum.deadline))
      .selectUtxosFrom(paymentUtxos),
    "withdraw transaction",
  );
}

/**
 * Backer refund: after the deadline, with the goal missed, pay the backer
 * their pledge. The head relocks with the pledge removed — or closes entirely
 * when this was the last outstanding pledge (the thread token leaves with the
 * change, since the one-shot policy forbids burning it).
 */
export async function buildRefundTx(
  wallet: BrowserWallet,
  campaignId: string,
): Promise<string> {
  const found = await getHead(campaignId);
  if (!found) throw new Error("Campaign head not found on-chain");
  const { utxo: head, head: datum } = found;

  const backerPkh = await getPkh(wallet);
  const pledge = datum.pledges.find((p) => p.backer === backerPkh);
  if (!pledge) throw new Error("You have no pledge in this campaign");
  if (totalPledged(datum) >= datum.goalLovelace)
    throw new Error("Goal was met — pledges cannot be refunded");

  const remaining = datum.pledges.filter((p) => p.backer !== backerPkh);
  const newDatum = buildHeadDatum({ ...datum, pledges: remaining });
  const redeemer: Data = { alternative: 2, fields: [backerPkh] };

  const tokenUnit = headTokenUnit(campaignId);
  const headLovelace = lovelaceOf(head);

  // Compute the relock lovelace (and any top-up needed) before reserving
  // collateral so the payment pool is sized correctly.
  let relockLovelace: bigint | null = null;
  let topUpNeeded = 0n;
  if (remaining.length > 0) {
    const residualLovelace = headLovelace - pledge.amount;
    const minHeadLovelace = await minAdaForHeadOutput(
      [
        { unit: "lovelace", quantity: String(residualLovelace) },
        { unit: tokenUnit, quantity: "1" },
      ],
      newDatum,
    );
    relockLovelace =
      residualLovelace > minHeadLovelace ? residualLovelace : minHeadLovelace;
    topUpNeeded = relockLovelace - residualLovelace;
    if (topUpNeeded < 0n) topUpNeeded = 0n;
  }

  const { collateral, paymentUtxos } = await ensureSpendableCollateral(
    wallet,
    topUpNeeded,
  );
  const changeAddress = await wallet.getChangeAddress();

  const tx = await newTxBuilder();
  let builder = tx
    .setNetwork(NETWORK)
    .spendingPlutusScriptV3()
    .txIn(head.input.txHash, head.input.outputIndex, head.output.amount, SCRIPT_ADDRESS)
    .txInScript(SCRIPT_CBOR)
    .txInInlineDatumPresent()
    .txInRedeemerValue(redeemer, "Mesh", EX_UNITS)
    .txInCollateral(
      collateral.input.txHash,
      collateral.input.outputIndex,
      collateral.output.amount,
      collateral.output.address,
    )
    .txOut(changeAddress, [{ unit: "lovelace", quantity: String(pledge.amount) }])
    .changeAddress(changeAddress)
    .requiredSignerHash(backerPkh)
    .invalidBefore(slotAfterDeadline(datum.deadline));

  if (relockLovelace !== null) {
    // Ensure the relocked head (with one fewer pledge) meets the min-UTxO.
    // Any top-up above headLovelace - pledge.amount is drawn from the backer's
    // payment UTxOs by coin selection and stays locked in the head.
    builder = builder
      .txOut(SCRIPT_ADDRESS, [
        { unit: "lovelace", quantity: String(relockLovelace) },
        { unit: tokenUnit, quantity: "1" },
      ])
      .txOutInlineDatumValue(newDatum, "Mesh");
  }

  return completeTx(
    builder.selectUtxosFrom(paymentUtxos),
    "refund transaction",
  );
}

/** Build a Mesh-built unsigned tx with timing/debug logging. */
async function completeTx(tx: MeshTxBuilder, label: string): Promise<string> {
  console.debug(`[fundada] building ${label}…`);
  const t = performance.now();
  const hex = await withTimeout(tx.complete(), 60_000, `Building ${label}`);
  console.debug(`[fundada] ${label} built in ${Math.round(performance.now() - t)}ms`);
  return hex;
}

/** Sign and submit a Mesh-built unsigned tx. */
export async function signAndSubmit(wallet: BrowserWallet, txHex: string): Promise<string> {
  console.debug("[fundada] asking wallet to sign…");
  const t0 = performance.now();
  const signed = await withTimeout(wallet.signTx(txHex, true), 120_000, "Wallet signing");
  console.debug(`[fundada] wallet signed in ${Math.round(performance.now() - t0)}ms`);
  const t1 = performance.now();
  const txHash = await withTimeout(wallet.submitTx(signed), 60_000, "Transaction submission");
  console.debug(`[fundada] submitted ${txHash} in ${Math.round(performance.now() - t1)}ms`);
  return txHash;
}
