<script lang="ts">
	import { onMount } from 'svelte';
	import { BrowserWalletState, withWallet } from '$lib/state/browser-wallet-state.svelte.js';
	import {
		fetchCampaigns,
		campaignStatus,
		formatAda,
		shortPkh,
		type OnChainCampaign,
		type CampaignStatus,
	} from '$lib/campaigns.svelte.js';
	import {
		buildRefundTx,
		buildWithdrawTx,
		getPkh,
		signAndSubmit,
		waitForTx,
		totalPledged,
		parseHeadDatum,
		fetchScriptUtxos,
		headTokenUnit,
		type CampaignHead,
	} from '$lib/fundada.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { LoaderCircle, TriangleAlert, CheckCircle2 } from '@lucide/svelte';
	import PulsingDot from '$lib/components/PulsingDot.svelte';

	type ClaimEntry = {
		info: OnChainCampaign;
		head: CampaignHead;
		role: 'founder' | 'backer';
		myPledge: bigint | null;
		busy: boolean;
		error: string;
		success: string;
	};

	let loading = $state(true);
	let loadError = $state('');
	let entries = $state<ClaimEntry[]>([]);
	let now = $state(Date.now());
	let pkh = $state<string | undefined>(undefined);

	const statusVariant: Record<CampaignStatus, 'default' | 'outline' | 'destructive'> = {
		active: 'outline',
		funded: 'default',
		missed: 'destructive',
	};
	const statusLabel: Record<CampaignStatus, string> = {
		active: 'Active',
		funded: 'Funded',
		missed: 'Refundable',
	};

	async function refresh() {
		try {
			const wallet = BrowserWalletState.browserWallet;
			if (!wallet) {
				loading = false;
				return;
			}
			pkh = await withWallet(getPkh);
			if (!pkh) {
				loading = false;
				return;
			}
			const all = await fetchCampaigns();
			const utxos = await fetchScriptUtxos();
			const filtered: ClaimEntry[] = [];
			for (const c of all) {
				const unit = headTokenUnit(c.campaignId);
				const utxo = utxos.find(
					(u) =>
						String(u.output.amount.find((a) => a.unit === unit)?.quantity) === '1',
				);
				if (!utxo) continue;
				const head = parseHeadDatum(utxo);
				if (!head) continue;
				const isFounder = pkh === head.founderPkh;
				const pledge = head.pledges.find((p) => p.backer === pkh);
				if (!isFounder && !pledge) continue;
				filtered.push({
					info: c,
					head,
					role: isFounder ? 'founder' : 'backer',
					myPledge: pledge ? pledge.amount : null,
					busy: false,
					error: '',
					success: '',
				});
			}
			entries = filtered;
		} catch (e) {
			loadError = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		refresh();
		const tick = setInterval(() => {
			now = Date.now();
		}, 1000);
		const refreshId = setInterval(refresh, 10_000);
		return () => {
			clearInterval(tick);
			clearInterval(refreshId);
		};
	});

	function deadlinePassed(e: ClaimEntry): boolean {
		return now > e.info.deadline;
	}
	function goalMet(e: ClaimEntry): boolean {
		return totalPledged(e.head) >= e.head.goalLovelace;
	}
	function withdrawn(e: ClaimEntry): boolean {
		return e.info.metGoal;
	}
	function claimableAt(e: ClaimEntry): number {
		return e.info.deadline + 180_000;
	}
	function claimUnlocked(e: ClaimEntry): boolean {
		return now > claimableAt(e);
	}

	function canWithdraw(e: ClaimEntry): boolean {
		return e.role === 'founder' && goalMet(e) && deadlinePassed(e) && !withdrawn(e);
	}
	function canRefund(e: ClaimEntry): boolean {
		return e.role === 'backer' && !!e.myPledge && !goalMet(e) && deadlinePassed(e);
	}

	function statusNote(e: ClaimEntry): string {
		if (!deadlinePassed(e)) return 'Campaign still active — claiming opens after the deadline.';
		if (withdrawn(e)) return 'Funds were withdrawn by the founder.';
		if (goalMet(e)) {
			if (e.role === 'founder') return 'Goal met — you can withdraw the full amount.';
			return 'Goal met — waiting for the founder to withdraw.';
		}
		if (e.role === 'backer') return 'Goal missed — you can reclaim your pledge.';
		return 'Goal missed — no pledges to reclaim.';
	}

	async function withdraw(e: ClaimEntry) {
		e.error = '';
		e.success = '';
		const wallet = BrowserWalletState.browserWallet;
		if (!wallet) return;
		if (BrowserWalletState.networkMismatch) {
			e.error = 'Your wallet is on the wrong network. Switch to Preprod to continue.';
			return;
		}
		e.busy = true;
		try {
			await withWallet(async (w) => {
				const unsigned = await buildWithdrawTx(w, e.info.campaignId);
				e.success = await signAndSubmit(w, unsigned);
				await waitForTx(w, e.success);
			});
			await refresh();
		} catch (err) {
			e.error = err instanceof Error ? err.message : String(err);
		} finally {
			e.busy = false;
		}
	}

	async function refund(e: ClaimEntry) {
		e.error = '';
		e.success = '';
		const wallet = BrowserWalletState.browserWallet;
		if (!wallet) return;
		if (BrowserWalletState.networkMismatch) {
			e.error = 'Your wallet is on the wrong network. Switch to Preprod to continue.';
			return;
		}
		e.busy = true;
		try {
			await withWallet(async (w) => {
				const unsigned = await buildRefundTx(w, e.info.campaignId);
				e.success = await signAndSubmit(w, unsigned);
				await waitForTx(w, e.success);
			});
			await refresh();
		} catch (err) {
			e.error = err instanceof Error ? err.message : String(err);
		} finally {
			e.busy = false;
		}
	}
</script>

<section class="mx-auto max-w-3xl">
	{#if loading}
		<section class="py-16 text-center">
			<LoaderCircle class="mx-auto mb-3 h-6 w-6 animate-spin text-muted-foreground" />
			<p class="text-sm text-muted-foreground">Loading your campaigns…</p>
		</section>
	{:else if loadError}
		<section class="py-16 text-center">
			<p class="mb-4 text-sm text-destructive">{loadError}</p>
			<Button variant="secondary" onclick={refresh}>Retry</Button>
		</section>
	{:else if !BrowserWalletState.browserWallet}
		<section class="py-16 text-center">
			<p class="mb-2 text-3xl font-semibold tracking-tight">Connect a wallet</p>
			<p class="text-sm text-muted-foreground">
				Connect your wallet to see campaigns you can claim from.
			</p>
		</section>
	{:else if entries.length === 0}
		<section class="py-16 text-center">
			<p class="mb-2 text-3xl font-semibold tracking-tight">Nothing to claim</p>
			<p class="text-sm text-muted-foreground">
				You haven't backed or created any campaigns yet.
			</p>
		</section>
	{:else}
		<div class="grid gap-6">
			{#each entries as e (e.info.campaignId)}
				{@const status = campaignStatus(e.info, now)}
				<Card.Root class="border-0 bg-[#09090b]">
					<Card.Content class="p-6">
						<div class="mb-4 flex items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<h2 class="line-clamp-1 text-lg font-semibold">
									<a href="/campaign?id={e.info.campaignId}" class="hover:underline">
										{e.info.title}
									</a>
								</h2>
								<p class="mt-0.5 text-xs text-muted-foreground">
									{e.role === 'founder' ? 'Founder' : 'Backer'} · {shortPkh(e.head.founderPkh)}
								</p>
							</div>
						{#if status === 'active'}
							<Badge variant="ghost" class="shrink-0 gap-1.5 bg-muted">
								<PulsingDot size="size-1.5" />
								{statusLabel[status]}
							</Badge>
						{:else}
							<Badge variant={statusVariant[status]} class="shrink-0">
								{statusLabel[status]}
							</Badge>
						{/if}
						</div>

						<dl class="grid grid-cols-2 gap-y-2 text-sm">
							<dt class="text-muted-foreground">Goal</dt>
							<dd class="text-right">₳ {formatAda(e.head.goalLovelace)}</dd>
							<dt class="text-muted-foreground">Pledged</dt>
							<dd class="text-right">₳ {formatAda(e.info.pledgedLovelace)}</dd>
							<dt class="text-muted-foreground">Deadline</dt>
							<dd class="text-right">
								{new Date(e.info.deadline).toLocaleString()}
							</dd>
							{#if e.myPledge !== null}
								<dt class="text-muted-foreground">Your pledge</dt>
								<dd class="text-right">₳ {formatAda(e.myPledge)}</dd>
							{/if}
						</dl>

						<p class="mt-4 rounded-2xl bg-secondary px-4 py-3 text-center text-sm font-medium text-secondary-foreground">
							{statusNote(e)}
						</p>

						{#if e.error}
							<Alert.Root variant="destructive" class="mt-4">
								<TriangleAlert />
								<Alert.Description>{e.error}</Alert.Description>
							</Alert.Root>
						{/if}
						{#if e.success}
							<Alert.Root class="mt-4">
								<CheckCircle2 />
								<Alert.Description class="break-all">Tx: {e.success}</Alert.Description>
							</Alert.Root>
						{/if}

						{#if canWithdraw(e)}
						<Button
							onclick={() => withdraw(e)}
							disabled={e.busy || !claimUnlocked(e) || BrowserWalletState.networkMismatch}
							class="mt-4 w-full py-5"
						>
								{#if e.busy}
									<LoaderCircle class="animate-spin" data-icon="inline-start" />
								{/if}
								{e.busy ? 'Withdrawing…' : `Withdraw ₳ ${formatAda(e.info.pledgedLovelace)}`}
							</Button>
							<p class="mt-2 text-center text-xs text-muted-foreground">
								{claimUnlocked(e)
									? 'Pays out every pledge in one transaction; the head relocks as completed.'
									: `Unlocks ${new Date(claimableAt(e)).toLocaleTimeString()} (slot safety window after the deadline).`}
							</p>
						{:else if canRefund(e)}
						<Button
							onclick={() => refund(e)}
							disabled={e.busy || !claimUnlocked(e) || BrowserWalletState.networkMismatch}
							class="mt-4 w-full py-5"
						>
								{#if e.busy}
									<LoaderCircle class="animate-spin" data-icon="inline-start" />
								{/if}
								{e.busy ? 'Reclaiming…' : `Reclaim your pledge (₳ ${formatAda(e.myPledge!)})`}
							</Button>
							<p class="mt-2 text-center text-xs text-muted-foreground">
								{claimUnlocked(e)
									? 'Returns your pledge to your wallet.'
									: `Unlocks ${new Date(claimableAt(e)).toLocaleTimeString()} (slot safety window after the deadline).`}
							</p>
						{/if}
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</section>
