<script lang="ts">
	import { onMount } from 'svelte';
	import {
		fetchCampaigns,
		type OnChainCampaign,
	} from '$lib/campaigns.svelte.js';
	import Wordmark from '$lib/components/Wordmark.svelte';
	import CampaignCard from '$lib/components/campaign/CampaignCard.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	let campaigns: OnChainCampaign[] = $state([]);
	let loading = $state(true);
	let error = $state('');
	let now = $state(Date.now());
	let brokenImages = $state(new Set<string>());

	onMount(() => {
		const load = async () => {
			try {
				campaigns = await fetchCampaigns();
				error = '';
			} catch (e) {
				error = e instanceof Error ? e.message : String(e);
			} finally {
				loading = false;
			}
		};
		load();
		const tick = setInterval(() => {
			now = Date.now();
		}, 1000);
		const reload = setInterval(load, 15_000);
		return () => {
			clearInterval(tick);
			clearInterval(reload);
		};
	});
</script>

{#if loading}
	<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
		{#each Array(3) as _}
			<Card.Root class="animate-pulse border-0 bg-[#09090b] py-0">
				<div class="aspect-video w-full bg-muted"></div>
				<Card.Content class="p-4">
					<div class="mb-3 h-5 w-2/3 rounded bg-muted"></div>
					<div class="mb-6 h-3 w-1/2 rounded bg-muted"></div>
					<div class="mb-3 h-2.5 w-full rounded-full bg-muted"></div>
					<div class="h-3 w-1/3 rounded bg-muted"></div>
				</Card.Content>
			</Card.Root>
		{/each}
	</div>
{:else if error}
	<Card.Root class="border-0 bg-[#09090b] py-12 text-center">
		<Card.Content>
			<p class="text-sm text-destructive">{error}</p>
			<p class="mt-1 text-xs text-muted-foreground">
				Could not load campaigns from the network.
			</p>
		</Card.Content>
	</Card.Root>
{:else if campaigns.length === 0}
	<Card.Root class="border-0 bg-[#09090b] py-14 text-center">
		<Card.Content>
			<div class="mb-4 flex justify-center opacity-80">
				<Wordmark size="sm" />
			</div>
			<p class="mb-1 text-sm font-medium text-foreground">No campaigns yet</p>
			<p class="mb-6 text-xs text-muted-foreground">
				Be the first — launch an all-or-nothing campaign in seconds.
			</p>
			<Button href="/create">Start a campaign</Button>
		</Card.Content>
	</Card.Root>
{:else}
	<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
		{#each campaigns as c (c.campaignId)}
			<CampaignCard campaign={c} {now} {brokenImages} />
		{/each}
	</div>
{/if}
