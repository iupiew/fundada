# fundada

**Non-custodial all-or-nothing crowdfunding.**

Fundada is an all-or-nothing crowdfunding dApp on Cardano. Every pledge is locked in an on-chain smart contract — not in Fundada's control. If a campaign hits its funding goal by the deadline, the founder can withdraw. If it doesn't, every backer — including the founder's own initial pledge — can reclaim their contribution automatically. No platform custody, no manual refund process, no trusting an operator to do the right thing.

> **Status: Cardano Preprod testnet only, unaudited.** Do not use with real funds. See [Security](#security) below.

---

## How it works

1. **Pledge.** Back a campaign you believe in. Your ADA moves into an on-chain escrow contract, not into anyone's wallet.
2. **Goal met.** If the campaign reaches its funding goal by the deadline, the founder can withdraw the funds.
3. **Goal missed.** If it doesn't, every backer can reclaim their contribution — automatically, with no approval needed from anyone.
4. **Verify it yourself.** Every rule above is enforced by the open-source smart contract in [`contracts/`](./contracts), not by anything Fundada says or does. Read the validator, don't take our word for it.

Each campaign is identified by a unique one-shot "thread token," minted at creation, which lets many independent campaigns run concurrently on a single validator without their pledge totals or state ever being mixed up.

---

## Tech stack

| Layer | Tool |
|---|---|
| Smart contract | [Aiken](https://aiken-lang.org) (Plutus V3) |
| Chain | Cardano (Preprod testnet) |
| Off-chain / wallet interaction | [Mesh SDK](https://meshjs.dev) |
| Chain indexing | Blockfrost |
| Frontend | SvelteKit + Tailwind CSS |
| Hosting | Cloudflare Pages / Workers |

---

## Project structure

```
fundada/
├── contracts/          # Aiken smart contracts
│   ├── validators/     # Campaign spend + one-shot mint validators
│   ├── scripts/        # Off-chain test/deploy scripts (Mesh SDK)
│   └── plutus.json     # Compiled contract blueprint (tracked — this is
│                        # the deployable artifact, not build cache)
├── src/                 # SvelteKit app
├── static/              # Static assets
└── ...
```

---

## Getting started

### Prerequisites
- [Node.js](https://nodejs.org) + [pnpm](https://pnpm.io)
- [Aiken](https://aiken-lang.org/installation-instructions) (only needed if you're modifying the contract)
- A [Blockfrost](https://blockfrost.io) Preprod project ID

### Setup

```bash
git clone https://github.com/<your-org>/fundada.git
cd fundada
pnpm install
cp .env.example .env   # fill in your Blockfrost Preprod project ID
pnpm dev
```

### Working on the contract

```bash
cd contracts
aiken check    # run the test suite
aiken build    # regenerate plutus.json
```

If you change the validator, you'll need to redeploy (new script address) and update the app's config to point at it — existing campaigns live at the old address and aren't automatically migrated.

---

## Roadmap

**Done**
- [x] All-or-nothing escrow contract (Aiken) — pledge, withdraw, refund
- [x] Campaign isolation via one-shot thread token
- [x] End-to-end tested on Cardano Preprod
- [x] Wallet connect (Lace)
- [x] Create / browse / pledge / claim flows

**Planned**
- [ ] Founder verification signals (linked socials, on-chain track record)
- [ ] Milestone-based funding with backer veto
- [ ] Mainnet launch (pending security review)
- [ ] Private backer pledges via [Midnight](https://midnight.network)

---

## Security

This contract has been tested end-to-end on Preprod, including deliberately re-creating and confirming the fix for a critical bug found during development: an earlier design let a backer's `Refund` transaction reconstruct "total pledged" from whatever inputs it chose to include, which allowed a backer to defect and reclaim funds from a campaign that had actually already met its goal. The current design closes this by keeping a single authoritative state UTxO per campaign (the thread-token "head") that every pledge, withdrawal, and refund must read and update atomically, rather than letting any transaction assert its own version of the total.

That said: **this has not been through a professional security audit**, and is not intended to hold real funds. Contract source is in [`contracts/validators/`](./contracts/validators) — read it, test it, and open an issue if you find something.

---

## License

[Apache-2.0](./LICENSE)
