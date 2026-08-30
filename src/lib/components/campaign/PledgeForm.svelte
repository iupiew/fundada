<script lang="ts">
	import { BrowserWalletState } from '$lib/state/browser-wallet-state.svelte.js';
	import type { OnChainCampaign } from '$lib/campaigns.svelte.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { LoaderCircle, TriangleAlert, CheckCircle2 } from '@lucide/svelte';

	let {
		info,
		pledgeAda = $bindable('5'),
		maxPledge,
		deadlinePassed,
		pledging,
		error,
		success,
		onpledge,
	}: {
		info: OnChainCampaign;
		pledgeAda: string;
		maxPledge: bigint | null;
		deadlinePassed: boolean;
		pledging: boolean;
		error: string;
		success: string;
		onpledge: () => void;
	} = $props();
</script>

<Card.Root class="border-0 bg-[#09090b]">
	<Card.Content class="p-6">
		<h2 class="mb-3 text-lg font-semibold">Pledge</h2>
		<div class="flex gap-3">
			<div class="grid gap-2">
				<Label for="pledge" class="sr-only">Amount (ADA)</Label>
			<Input
				id="pledge"
				type="number"
				min="1"
				step="1"
				bind:value={pledgeAda}
				disabled={deadlinePassed}
				class="w-40 border-0 bg-[#18181b] text-foreground shadow-none dark:bg-[#18181b]"
			/>
			</div>
			<Button onclick={onpledge} disabled={pledging || deadlinePassed || BrowserWalletState.networkMismatch} class="self-start">
				{#if pledging}
					<LoaderCircle class="animate-spin" data-icon="inline-start" />
				{/if}
				{pledging ? 'Pledging…' : 'Pledge ADA'}
			</Button>
		</div>
		{#if maxPledge !== null && !deadlinePassed}
			<p class="mt-2 text-xs text-muted-foreground">
				You can pledge up to ₳ {(Number(maxPledge) / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} — the rest of your balance stays
				reserved for collateral, fees, and the minimum change output.
			</p>
		{/if}
		{#if error}
			<Alert.Root variant="destructive" class="mt-3">
				<TriangleAlert />
				<Alert.Description>{error}</Alert.Description>
			</Alert.Root>
		{/if}
		{#if success}
			<Alert.Root class="mt-3">
				<CheckCircle2 />
				<Alert.Description class="break-all">Tx: {success}</Alert.Description>
			</Alert.Root>
		{/if}
		<p class="mt-4 break-all text-xs text-muted-foreground">
			Campaign id: {info.campaignId}
		</p>
	</Card.Content>
</Card.Root>
