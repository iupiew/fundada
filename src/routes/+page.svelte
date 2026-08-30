<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	const steps = [
		'Pledge. Back a campaign you believe in. Your ADA moves into an on-chain escrow contract, not into anyone\'s wallet.',
		'Goal met. If the campaign reaches its funding goal by the deadline, the founder can withdraw the funds.',
		'Goal missed. If it doesn\'t, every backer — including the founder\'s own initial pledge — can reclaim their contribution automatically.',
		'Verify it yourself. Every campaign\'s rules are enforced by open-source, publicly auditable smart contract code. Nothing here relies on trusting Fundada.',
	];
</script>

<section class="py-20 text-center sm:py-28">
	<h1 class="mx-auto mb-6 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">
		Non-custodial all-or-nothing crowdfunding.
	</h1>
	<p class="mx-auto mb-10 max-w-xl text-base leading-relaxed text-muted-foreground">
		Pledges are locked in escrow until the deadline. If the goal is met, the founder can withdraw. If it isn't, every backer is refunded automatically — no platform in the middle.
	</p>
	<div class="flex justify-center gap-3">
		<Button size="lg" href="/create">Start a campaign</Button>
		<Button size="lg" variant="secondary" href="/campaigns">Browse campaigns</Button>
	</div>
</section>

<section class="border-t border-border">
	<div class="mx-auto max-w-xl py-16 sm:py-20">
		<h2 class="mb-8 text-center text-lg font-semibold text-foreground">How it works</h2>
		<ol class="flex flex-col gap-6">
			{#each steps as step, i (step)}
				<li class="flex items-start gap-4">
					<span class="mt-0.5 shrink-0 font-mono text-sm text-muted-foreground">
						{String(i + 1).padStart(2, '0')}
					</span>
					<p class="text-sm leading-relaxed text-foreground">{step}</p>
				</li>
			{/each}
		</ol>
	</div>
</section>

<section class="border-t border-border">
	<div class="mx-auto max-w-xl px-6 py-12 text-center">
		<p class="mb-8 text-center text-lg font-semibold text-foreground">Built with</p>
		<!-- Cardano brand guidelines: min 64px web / 60px tablet / 56px phone, full
		     brand color (no recoloring/opacity), safe area clearance around the
		     logo, and equal-or-larger size vs any co-displayed partner logo. -->
		<div class="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
			<img src="/cardano-starburst-white.svg" alt="Cardano" class="h-14 w-auto sm:h-16" />
			<img src="/aiken-icon.png" alt="Aiken" class="h-14 w-auto sm:h-16" />
		</div>
	</div>
</section>
