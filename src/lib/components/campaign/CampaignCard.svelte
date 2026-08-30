<script lang="ts">
	import {
		campaignStatus,
		formatAda,
		type OnChainCampaign,
		type CampaignStatus,
	} from '$lib/campaigns.svelte.js';
	import { coverImageUrl } from '$lib/campaign-links.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import PulsingDot from '$lib/components/PulsingDot.svelte';

	let {
		campaign,
		now,
		brokenImages,
	}: {
		campaign: OnChainCampaign;
		now: number;
		brokenImages: Set<string>;
	} = $props();

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

	const status = $derived(campaignStatus(campaign, now));
	const image = $derived(
		brokenImages.has(campaign.campaignId) ? null : coverImageUrl(campaign.links),
	);

	function countdown(c: OnChainCampaign): string {
		const remaining = c.deadline - now;
		if (remaining <= 0) return 'Deadline passed';
		const s = Math.floor(remaining / 1000);
		const d = Math.floor(s / 86400);
		const h = Math.floor((s % 86400) / 3600);
		const m = Math.floor((s % 3600) / 60);
		if (d > 0) return `${d}d ${h}h left`;
		if (h > 0) return `${h}h ${m}m left`;
		return `${m}m ${s % 60}s left`;
	}

	function progress(c: OnChainCampaign): number {
		if (c.goalLovelace <= 0n) return 0;
		return Math.min(100, Number((c.pledgedLovelace * 100n) / c.goalLovelace));
	}
</script>

<a href="/campaign?id={campaign.campaignId}" class="group">
	<Card.Root class="h-full border-0 bg-[#09090b] py-0 transition duration-200">
		{#if image}
			<img
				src={image}
				alt={campaign.title}
				loading="lazy"
				class="aspect-video w-full object-cover"
				onerror={() => brokenImages.add(campaign.campaignId)}
			/>
		{:else}
			<div class="flex aspect-video w-full items-center justify-center bg-muted">
				<span class="font-heading text-2xl font-semibold text-muted-foreground">
					{(campaign.title.trim()[0] ?? '?').toUpperCase()}
				</span>
			</div>
		{/if}
		<Card.Content class="flex h-full flex-col p-4">
			<div class="mb-3 flex items-start justify-between gap-3">
				<h3 class="line-clamp-2 text-base leading-snug font-semibold">
					{campaign.title}
				</h3>
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

			{#if campaign.description}
				<p class="mb-4 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
					{campaign.description}
				</p>
			{/if}

			<div class="mt-auto">
				<div class="mb-2 flex items-baseline justify-between text-sm">
					<span class="font-semibold">₳ {formatAda(campaign.pledgedLovelace)}</span>
					<span class="text-xs text-muted-foreground">
						of ₳ {formatAda(campaign.goalLovelace)}
					</span>
				</div>
				<Progress value={progress(campaign)} class="h-2" />
				<div class="mt-2 flex items-center justify-between text-xs">
					<span class="text-muted-foreground">
						{campaign.pledgeCount} {campaign.pledgeCount === 1 ? 'pledge' : 'pledges'}
					</span>
					<span class="text-muted-foreground">{countdown(campaign)}</span>
				</div>
			</div>
		</Card.Content>
	</Card.Root>
</a>
