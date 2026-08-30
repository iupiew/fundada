<script lang="ts">
	const doneItems = [
		'All-or-nothing escrow contract (Aiken) — pledge, withdraw, refund',
		'Campaign isolation via one-shot thread token',
		'End-to-end tested on Cardano Preprod',
		'Wallet connect (Lace)',
		'Create / browse / pledge / claim flows',
	];

	const plannedItems = [
		'Founder verification signals (linked socials, on-chain track record)',
		'Milestone-based funding with backer veto',
		'Mainnet launch (pending security review)',
		'Private backer pledges via Midnight',
	];
</script>

<svelte:head>
	<title>fundada</title>
</svelte:head>

<section class="mx-auto max-w-2xl">
	<div class="mb-8">
		<h2 class="mb-4 text-lg font-semibold text-foreground">Done</h2>
		<ul class="flex flex-col gap-3">
			{#each doneItems as item (item)}
				<li class="flex items-start gap-3 text-sm text-foreground">
					<span class="mt-0.5 select-none">✓</span>
					{item}
				</li>
			{/each}
		</ul>
	</div>

	<div>
		<h2 class="mb-4 text-lg font-semibold text-foreground">Planned</h2>
		<ul class="flex flex-col gap-3">
			{#each plannedItems as item (item)}
				<li class="flex items-start gap-3 text-sm text-muted-foreground">
					<span class="mt-0.5 select-none">○</span>
					{item}
				</li>
			{/each}
		</ul>
	</div>
</section>
