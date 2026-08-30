<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { BrowserWalletState, withWallet } from '$lib/state/browser-wallet-state.svelte.js';
	import { CampaignStore } from '$lib/campaign-store.svelte.js';
	import { resolveCampaign, toOnChainCampaign, type OnChainCampaign } from '$lib/campaigns.svelte.js';
	import { buildPledgeTx, signAndSubmit, waitForTx, maxPledgeableLovelace, getHeadUtxo, parseHeadDatum, type CampaignHead } from '$lib/fundada.js';
	import { coverImageUrl } from '$lib/campaign-links.js';
	import type { UTxO } from '@meshsdk/core';
	import CampaignProgress from '$lib/components/campaign/CampaignProgress.svelte';
	import PledgeForm from '$lib/components/campaign/PledgeForm.svelte';
	import BackerGraph from '$lib/components/campaign/BackerGraph.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { LoaderCircle } from '@lucide/svelte';

	const campaignId = $derived(page.url.searchParams.get('id'));

	let info = $state<OnChainCampaign | null>(null);
	let head = $state<CampaignHead | null>(null);
	let headUtxo = $state<UTxO | null>(null);
	let loading = $state(true);
	let loadError = $state('');
	let notFound = $state(false);
	let searching = $state(false);
	let now = $state(Date.now());
	let pledgeAda = $state('5');
	let maxPledge = $state<bigint | null>(null);
	let pledging = $state(false);
	let error = $state('');
	let success = $state('');

	$effect(() => {
		const wallet = BrowserWalletState.browserWallet;
		if (!wallet) {
			maxPledge = null;
			return;
		}
		maxPledgeableLovelace(wallet)
			.then((v) => (maxPledge = v))
			.catch(() => (maxPledge = null));
	});

	const deadlinePassed = $derived(info ? now > info.deadline : false);
	let brokenImageUrl = $state<string | null>(null);
	const imageUrl = $derived(info ? coverImageUrl(info.links) : null);

	async function refresh(retries = 1) {
		try {
			const id = campaignId || CampaignStore.campaign?.campaignId;
			if (!id) {
				notFound = true;
				loading = false;
				return;
			}
			if (retries > 1) searching = true;
			const resolved = await resolveCampaignWithRetries(id, retries);
			if (resolved) {
				info = resolved.info;
				head = resolved.head;
				headUtxo = resolved.utxo;
				notFound = false;
				loadError = '';
			} else {
				notFound = true;
			}
		} catch (e) {
			loadError = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
			searching = false;
		}
	}

	async function resolveCampaignWithRetries(id: string, retries: number) {
		if (retries <= 1) {
			return await resolveCampaign(id);
		}
		const utxo = await getHeadUtxo(id, retries);
		if (!utxo) return null;
		const head = parseHeadDatum(utxo);
		if (!head) return null;
		return { utxo, head, info: toOnChainCampaign(utxo, head) };
	}

	onMount(() => {
		refresh(12);
		const tick = setInterval(() => {
			now = Date.now();
		}, 1000);
		const refreshId = setInterval(() => refresh(), 10_000);
		return () => {
			clearInterval(tick);
			clearInterval(refreshId);
		};
	});

	async function pledge() {
		error = '';
		success = '';
		const wallet = BrowserWalletState.browserWallet;
		if (!wallet) {
			error = 'Connect a wallet first.';
			return;
		}
		if (BrowserWalletState.networkMismatch) {
			error = 'Your wallet is on the wrong network. Switch to Preprod to continue.';
			return;
		}
		if (!info) {
			error = 'No campaign configured.';
			return;
		}
		if (deadlinePassed) {
			error = 'The deadline has passed — pledging is closed.';
			return;
		}
		const amount = Math.round(Number(pledgeAda) * 1_000_000);
		if (amount <= 0) {
			error = 'Enter a pledge amount.';
			return;
		}

		pledging = true;
		try {
			await withWallet(async (w) => {
				const unsigned = await buildPledgeTx(w, info!.campaignId, amount);
				success = await signAndSubmit(w, unsigned);
				await waitForTx(w, success);
			});
			await refresh(12);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			pledging = false;
		}
	}
</script>

{#if loading}
	<section class="py-16 text-center">
		<LoaderCircle class="mx-auto mb-3 h-6 w-6 animate-spin text-muted-foreground" />
		<p class="text-sm text-muted-foreground">
			{searching ? 'Looking for campaign…' : 'Loading campaign…'}
		</p>
	</section>
{:else if notFound}
	<section class="py-16 text-center">
		<h1 class="mb-2 text-3xl font-semibold tracking-tight">No campaign found</h1>
		<p class="mb-6 text-sm text-muted-foreground">
			{CampaignStore.campaign
				? 'The campaign head is no longer on-chain — it may have been fully refunded.'
				: 'Create one to get started, or open a campaign from the home page.'}
		</p>
		<Button href="/create">Start a campaign</Button>
	</section>
{:else if loadError}
	<section class="py-16 text-center">
		<p class="mb-4 text-sm text-destructive">{loadError}</p>
		<Button variant="secondary" onclick={() => refresh()}>Retry</Button>
	</section>
{:else if info}
	<section class="mx-auto max-w-2xl">
		{#if imageUrl}
			<div class="mb-6 overflow-hidden rounded-2xl">
				{#if brokenImageUrl === imageUrl}
					<div class="flex h-56 w-full items-center justify-center bg-muted sm:h-64">
						<span class="font-heading text-3xl font-semibold text-muted-foreground">
							{(info.title.trim()[0] ?? '?').toUpperCase()}
						</span>
					</div>
				{:else}
					<img
						src={imageUrl}
						alt={info.title}
						class="h-56 w-full object-cover sm:h-64"
						onerror={() => (brokenImageUrl = imageUrl)}
					/>
				{/if}
			</div>
		{/if}
		<h1 class="mb-1 text-3xl font-semibold tracking-tight">{info.title}</h1>
		<p class="mb-6 text-muted-foreground">{info.description || 'No description.'}</p>

		<CampaignProgress {info} {now} />

		{#if head && head.pledges.length > 0}
			<div class="mb-6 rounded-2xl bg-[#09090b] p-4">
				<h2 class="mb-2 text-sm font-semibold text-muted-foreground">Backers</h2>
				<BackerGraph pledges={head.pledges} goalLovelace={head.goalLovelace} />
			</div>
		{/if}

		<PledgeForm
			{info}
			bind:pledgeAda
			{maxPledge}
			{deadlinePassed}
			{pledging}
			{error}
			{success}
			onpledge={pledge}
		/>
	</section>
{/if}
