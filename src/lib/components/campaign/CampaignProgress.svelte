<script lang="ts">
	import { formatAda, type OnChainCampaign } from '$lib/campaigns.svelte.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';

	let {
		info,
		now,
	}: {
		info: OnChainCampaign;
		now: number;
	} = $props();

	const deadlinePassed = $derived(now > info.deadline);
	const progress = $derived(
		info.goalLovelace > 0n
			? Math.min(100, Number((info.pledgedLovelace * 100n) / info.goalLovelace))
			: 0,
	);

	function countdownLabel(): string {
		if (deadlinePassed) return 'Deadline passed';
		const s = Math.floor((info.deadline - now) / 1000);
		const d = Math.floor(s / 86400);
		const h = Math.floor((s % 86400) / 3600);
		const m = Math.floor((s % 3600) / 60);
		const sec = s % 60;
		return `${d}d ${h}h ${m}m ${sec}s remaining`;
	}
</script>

<Card.Root class="mb-6 border-0 bg-[#09090b]">
	<Card.Content class="p-6">
		<div class="mb-3 flex items-baseline justify-between text-sm">
			<span class="text-muted-foreground">
				Pledged: <span class="font-semibold text-foreground">₳ {formatAda(info.pledgedLovelace)}</span> /
				₳ {formatAda(info.goalLovelace)}
			</span>
			<span class={deadlinePassed ? 'text-destructive' : 'text-muted-foreground'}>
				{countdownLabel()}
			</span>
		</div>
		<Progress value={progress} class="h-2.5" />
		<p class="mt-2.5 text-xs text-muted-foreground">
			{#if info.metGoal}
				Goal met — the founder can withdraw the funds on the Claim page.
			{:else if deadlinePassed}
				Goal missed — backers can reclaim their pledges on the Claim page.
			{:else}
				All-or-nothing: if the goal is missed by the deadline, pledges are refunded.
			{/if}
		</p>
		<div class="mt-3 flex items-center justify-between text-xs text-muted-foreground">
			<span>
				{info.pledgeCount}
				{info.pledgeCount === 1 ? 'backer' : 'backers'}
			</span>
			<a href="/claim?id={info.campaignId}" class="underline-offset-4 hover:underline">View claim options →</a>
		</div>
	</Card.Content>
</Card.Root>
