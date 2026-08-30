<script lang="ts">
	import { NETWORK } from '$lib/config-eager.js';
	import { BrowserWalletState } from '$lib/state/browser-wallet-state.svelte.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import PulsingDot from '$lib/components/PulsingDot.svelte';

	const connected = $derived(!!BrowserWalletState.browserWallet);

	const options = [
		{ value: 'preprod' as const, label: 'Preprod' },
		{ value: 'mainnet' as const, label: 'Main' },
	];

	let selected = $state<'preprod' | 'mainnet'>(
		NETWORK === 'mainnet' ? 'mainnet' : 'preprod',
	);
	let open = $state(false);

	const label = $derived(options.find((o) => o.value === selected)?.label ?? selected);
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		class="inline-flex h-4 cursor-pointer items-center gap-1 rounded-4xl px-1.5 text-[10px] font-semibold text-foreground transition-colors hover:text-foreground/70 lg:h-6 lg:gap-1.5 lg:px-2.5 lg:text-xs"
		style="background-color: #18181b;"
	>
		{#if connected}
			<PulsingDot />
		{:else}
			<span class="size-1.5 shrink-0 rounded-full bg-zinc-400 lg:size-2"></span>
		{/if}
		{label}
	</Popover.Trigger>
	<Popover.Content align="end" class="w-32 gap-1 p-1">
		{#each options as option (option.value)}
			<button
				type="button"
				class="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs text-card-foreground transition-colors hover:bg-muted {selected === option.value ? 'font-semibold' : ''}"
				onclick={() => {
					selected = option.value;
					open = false;
				}}
			>
				{option.label}
				{#if selected === option.value}
					<span class="text-foreground">●</span>
				{/if}
			</button>
		{/each}
	</Popover.Content>
</Popover.Root>
