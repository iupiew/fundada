// ─────────────────────────────────────────────────────────────────────────
// UNTESTED — no Aiken toolchain was available to compile/run this. Run
// `aiken check` and `aiken build` immediately and treat any stdlib function
// name mismatch (see notes below) as expected friction, not a design flaw.
//
// Likely spots to double check against your installed Aiken stdlib version:
//   - `interval.is_entirely_before` (mirrors `is_entirely_after`, used below
//     for the "pledge must happen before deadline" check — verify this
//     function exists under that exact name in aiken/interval)
//   - `list.head` (returns Option<a>, used in `head_output_datum`)
//   - `expect d: CampaignDatum = data` cast syntax for decoding InlineDatum
//   - `==` structural equality on List<Pledge> / ByteArray fields
// ─────────────────────────────────────────────────────────────────────────

use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use aiken/interval
use cardano/address.{Address, from_verification_key}
use cardano/assets.{PolicyId}
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction, find_input,
  placeholder,
}

/// A single backer's contribution, tracked as an entry inside the
/// campaign's one authoritative state UTxO (the "head"). This is what
/// replaces trying to reconstruct "total pledged" by summing whatever
/// UTxOs happen to be included in a given transaction — that approach is
/// trivially gameable (a transaction can simply omit other backers' UTxOs),
/// so the total must instead live in one UTxO that every pledge, withdraw,
/// and refund is forced to read and update atomically.
pub type Pledge {
  backer: VerificationKeyHash,
  amount: Int,
}

/// Datum attached to the campaign's single head UTxO — the one that always
/// carries the thread token. `pledges` is the complete, authoritative list
/// of every backer's contribution so far. `title`/`description`/`links` are
/// immutable campaign metadata, now explicitly protected on every state
/// transition (see the equality checks in each branch below) instead of
/// silently allowed to change on withdraw as before.
pub type CampaignDatum {
  founder: VerificationKeyHash,
  goal_lovelace: Int,
  deadline: Int,
  campaign_id: PolicyId,
  met_goal: Bool,
  pledges: List<Pledge>,
  title: ByteArray,
  description: ByteArray,
  links: ByteArray,
}

pub type Action {
  MakePledge { backer: VerificationKeyHash, amount: Int }
  Withdraw
  Refund { backer: VerificationKeyHash }
}

const thread_token_name = #"46554e44414441"

// ─── Pledge list helpers ───────────────────────────────────────────────────

fn total_pledged(pledges: List<Pledge>) -> Int {
  list.foldl(pledges, 0, fn(p, acc) { acc + p.amount })
}

fn find_pledge(
  pledges: List<Pledge>,
  backer: VerificationKeyHash,
) -> Option<Pledge> {
  list.find(pledges, fn(p) { p.backer == backer })
}

fn remove_pledge(
  pledges: List<Pledge>,
  backer: VerificationKeyHash,
) -> List<Pledge> {
  list.filter(pledges, fn(p) { p.backer != backer })
}

/// Add a new pledge, or top up an existing backer's pledge if they've
/// contributed before.
fn upsert_pledge(
  pledges: List<Pledge>,
  backer: VerificationKeyHash,
  amount: Int,
) -> List<Pledge> {
  when find_pledge(pledges, backer) is {
    Some(_) ->
      list.map(
        pledges,
        fn(p) {
          if p.backer == backer {
            Pledge { backer, amount: p.amount + amount }
          } else {
            p
          }
        },
      )
    None -> [Pledge { backer, amount }, ..pledges]
  }
}

// ─── Transaction helpers ────────────────────────────────────────────────────

fn script_address(own_ref: OutputReference, tx: Transaction) -> Address {
  expect Some(input) = find_input(tx.inputs, own_ref)
  input.output.address
}

/// Decode the campaign's relocked head output — the one output in this
/// transaction sent back to the script address carrying the thread token —
/// as a CampaignDatum, if present.
fn head_output_datum(
  tx: Transaction,
  address: Address,
  campaign_id: PolicyId,
) -> Option<CampaignDatum> {
  let matches = list.filter(
    tx.outputs,
    fn(output: Output) {
      output.address == address && assets.quantity_of(
        output.value,
        campaign_id,
        thread_token_name,
      ) == 1
    },
  )
  when list.head(matches) is {
    Some(output) ->
      when output.datum is {
        InlineDatum(data) -> {
          expect d: CampaignDatum = data
          Some(d)
        }
        _ -> None
      }
    None -> None
  }
}

fn deadline_passed(tx: Transaction, deadline: Int) -> Bool {
  tx.validity_range |> interval.is_entirely_after(deadline)
}

fn deadline_not_passed(tx: Transaction, deadline: Int) -> Bool {
  tx.validity_range |> interval.is_entirely_before(deadline)
}

/// Whether `who` receives at least `amount` lovelace as a plain output in
/// this transaction.
fn is_paid(tx: Transaction, who: VerificationKeyHash, amount: Int) -> Bool {
  let addr = from_verification_key(who)
  list.any(
    tx.outputs,
    fn(output: Output) {
      output.address.payment_credential == addr.payment_credential && assets.lovelace_of(
        output.value,
      ) >= amount
    },
  )
}

/// Every field the immutable campaign record must keep identical across
/// MakePledge/Withdraw/Refund, except the fields each action is explicitly
/// allowed to change (`pledges`, `met_goal`).
fn same_campaign_identity(a: CampaignDatum, b: CampaignDatum) -> Bool {
  and {
    a.founder == b.founder,
    a.goal_lovelace == b.goal_lovelace,
    a.deadline == b.deadline,
    a.campaign_id == b.campaign_id,
    a.title == b.title,
    a.description == b.description,
    a.links == b.links,
  }
}

// ─── One-shot minting policy (unchanged) ───────────────────────────────────

validator one_shot_mint(seed: OutputReference) {
  mint(_redeemer: Option<Int>, own_policy: PolicyId, tx: Transaction) {
    expect Some(_) = list.find(
      tx.inputs,
      fn(input: Input) { input.output_reference == seed },
    )
    assets.quantity_of(tx.mint, own_policy, thread_token_name) == 1
  }

  else(_) {
    fail
  }
}

// ─── Campaign spending validator ───────────────────────────────────────────

validator campaign(version: Int) {
  spend(
    datum: Option<CampaignDatum>,
    action: Action,
    own_ref: OutputReference,
    tx: Transaction,
  ) {
    expect version == 1
    expect Some(d) = datum
    let address = script_address(own_ref, tx)

    when action is {
      // A backer contributes (or tops up their existing contribution).
      // Must happen before the deadline, must be signed by the backer
      // being credited, and the relocked head must reflect exactly the
      // old pledge list plus this one addition — nothing else.
      MakePledge { backer, amount } -> {
        expect Some(new_head) = head_output_datum(tx, address, d.campaign_id)
        and {
          deadline_not_passed(tx, d.deadline),
          amount > 0,
          list.has(tx.extra_signatories, backer),
          same_campaign_identity(d, new_head),
          new_head.met_goal == False,
          new_head.pledges == upsert_pledge(d.pledges, backer, amount),
        }
      }

      // The founder claims the funds. `total_pledged` is read off the one
      // authoritative pledges list in `d` — the same list every pledge
      // transaction updated atomically — so this can no longer be gamed by
      // a transaction that simply omits other backers' contributions.
      Withdraw -> {
        expect Some(new_head) = head_output_datum(tx, address, d.campaign_id)
        and {
          deadline_passed(tx, d.deadline),
          list.has(tx.extra_signatories, d.founder),
          total_pledged(d.pledges) >= d.goal_lovelace,
          is_paid(tx, d.founder, total_pledged(d.pledges)),
          same_campaign_identity(d, new_head),
          new_head.met_goal == True,
        }
      }

      // A backer reclaims their own pledge. Only valid if the campaign's
      // full, authoritative total (not a subset chosen by this
      // transaction) is below goal — a backer can no longer defect from a
      // campaign that actually succeeded.
      Refund { backer } -> {
        expect Some(pledge) = find_pledge(d.pledges, backer)
        and {
          deadline_passed(tx, d.deadline),
          total_pledged(d.pledges) < d.goal_lovelace,
          list.has(tx.extra_signatories, backer),
          is_paid(tx, backer, pledge.amount),
          when head_output_datum(tx, address, d.campaign_id) is {
            // Other backers remain — relock the head with this one removed.
            Some(new_head) ->
              same_campaign_identity(d, new_head) && new_head.met_goal == False && new_head.pledges == remove_pledge(
                d.pledges,
                backer,
              )
            // This was the last outstanding pledge — allow the head to
            // close instead of relocking (nothing left to track). If you'd
            // rather always keep a permanent on-chain marker even for
            // failed campaigns, remove this branch and require a relock
            // with an empty pledges list instead.
            None -> remove_pledge(d.pledges, backer) == []
          },
        }
      }
    }
  }

  else(_) {
    fail
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────

const deadline: Int = 1_750_000_000_000

const founder: VerificationKeyHash =
  #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

const backer_a: VerificationKeyHash =
  #"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

const backer_b: VerificationKeyHash =
  #"dddddddddddddddddddddddddddddddddddddddddddddddddddddddd"

const other: VerificationKeyHash =
  #"cccccccccccccccccccccccccccccccccccccccccccccccccccccccc"

const goal: Int = 10_000_000

// 10 ADA
const pledge_a: Int = 6_000_000

// 6 ADA
const pledge_b: Int = 5_000_000

// 5 ADA — combined with pledge_a this clears the goal

const cid_a: PolicyId = #"0000000000000000000000000000000000000000000000000000"

fn base_datum(pledges: List<Pledge>, met_goal: Bool) -> CampaignDatum {
  CampaignDatum {
    founder,
    goal_lovelace: goal,
    deadline,
    campaign_id: cid_a,
    met_goal,
    pledges,
    title: #"",
    description: #"",
    links: #"",
  }
}

fn script_addr() -> Address {
  address.from_script(
    #"ffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  )
}

fn head_output(pledges: List<Pledge>, met_goal: Bool, lovelace: Int) -> Output {
  Output {
    address: script_addr(),
    value: assets.merge(
      assets.from_lovelace(lovelace),
      assets.from_asset(cid_a, thread_token_name, 1),
    ),
    datum: InlineDatum(base_datum(pledges, met_goal)),
    reference_script: None,
  }
}

fn payout(who: VerificationKeyHash, lovelace: Int) -> Output {
  Output {
    address: from_verification_key(who),
    value: assets.from_lovelace(lovelace),
    datum: transaction.NoDatum,
    reference_script: None,
  }
}

fn own_ref() -> OutputReference {
  OutputReference { transaction_id: placeholder.id, output_index: 0 }
}

fn script_input(pledges: List<Pledge>, met_goal: Bool, lovelace: Int) -> Input {
  Input {
    output_reference: own_ref(),
    output: head_output(pledges, met_goal, lovelace),
  }
}

fn context(
  script_inputs: List<Input>,
  outputs: List<Output>,
  validity_range: interval.Interval,
  signatories: List<VerificationKeyHash>,
) -> Transaction {
  Transaction {
    inputs: script_inputs,
    reference_inputs: [],
    outputs,
    fee: 0,
    mint: assets.zero,
    certificates: [],
    withdrawals: [],
    validity_range,
    extra_signatories: signatories,
    redeemers: [],
    datums: dict.empty,
    id: placeholder.id,
    votes: [],
    proposal_procedures: [],
    current_treasury_amount: None,
    treasury_donation: None,
  }
}

test pledge_success() {
  let old = [Pledge { backer: backer_a, amount: pledge_a }]
  let tx = context(
    [script_input(old, False, pledge_a)],
    [
      head_output(
        [Pledge { backer: backer_a, amount: pledge_a + pledge_b }],
        False,
        pledge_a + pledge_b,
      ),
    ],
    interval.entirely_before(deadline),
    [backer_a],
  )
  campaign.spend(
    1,
    Some(base_datum(old, False)),
    MakePledge { backer: backer_a, amount: pledge_b },
    own_ref(),
    tx,
  )
}

test pledge_after_deadline_fails() {
  let old = []
  let tx = context(
    [script_input(old, False, 0)],
    [
      head_output(
        [Pledge { backer: backer_a, amount: pledge_a }],
        False,
        pledge_a,
      ),
    ],
    interval.entirely_after(deadline),
    [backer_a],
  )
  !campaign.spend(
    1,
    Some(base_datum(old, False)),
    MakePledge { backer: backer_a, amount: pledge_a },
    own_ref(),
    tx,
  )
}

test withdraw_success() {
  let pledges = [
    Pledge { backer: backer_a, amount: pledge_a },
    Pledge { backer: backer_b, amount: pledge_b },
  ]
  let tx = context(
    [script_input(pledges, False, pledge_a + pledge_b)],
    [payout(founder, pledge_a + pledge_b), head_output(pledges, True, 0)],
    interval.entirely_after(deadline),
    [founder],
  )
  campaign.spend(1, Some(base_datum(pledges, False)), Withdraw, own_ref(), tx)
}

test withdraw_below_goal_fails() {
  let pledges = [Pledge { backer: backer_a, amount: pledge_a }]
  let tx = context(
    [script_input(pledges, False, pledge_a)],
    [payout(founder, pledge_a), head_output(pledges, True, 0)],
    interval.entirely_after(deadline),
    [founder],
  )
  !campaign.spend(1, Some(base_datum(pledges, False)), Withdraw, own_ref(), tx)
}

test refund_success_when_goal_not_met() {
  let pledges = [Pledge { backer: backer_a, amount: pledge_a }]
  let tx = context(
    [script_input(pledges, False, pledge_a)],
    [payout(backer_a, pledge_a)],
    interval.entirely_after(deadline),
    [backer_a],
  )
  campaign.spend(
    1,
    Some(base_datum(pledges, False)),
    Refund { backer: backer_a },
    own_ref(),
    tx,
  )
}

// This is the test that proves the original bug is fixed: a backer cannot
// walk away with a refund by simply omitting other backers from their
// transaction, because `total_pledged` is now read from the single
// authoritative `pledges` list rather than summed from whatever inputs the
// transaction happens to include.
test backer_cannot_defect_from_successful_campaign() {
  let pledges = [
    Pledge { backer: backer_a, amount: pledge_a },
    Pledge { backer: backer_b, amount: pledge_b },
  ]
  // pledge_a + pledge_b >= goal, so the campaign succeeded — backer_a
  // attempts to refund anyway.
  let tx = context(
    [script_input(pledges, False, pledge_a + pledge_b)],
    [payout(backer_a, pledge_a)],
    interval.entirely_after(deadline),
    [backer_a],
  )
  !campaign.spend(
    1,
    Some(base_datum(pledges, False)),
    Refund { backer: backer_a },
    own_ref(),
    tx,
  )
}

test refund_by_wrong_backer_fails() {
  let pledges = [Pledge { backer: backer_a, amount: pledge_a }]
  let tx = context(
    [script_input(pledges, False, pledge_a)],
    [payout(backer_a, pledge_a)],
    interval.entirely_after(deadline),
    [other],
  )
  !campaign.spend(
    1,
    Some(base_datum(pledges, False)),
    Refund { backer: backer_a },
    own_ref(),
    tx,
  )
}
