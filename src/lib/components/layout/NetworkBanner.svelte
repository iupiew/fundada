<script lang="ts">
	import { BrowserWalletState } from '$lib/state/browser-wallet-state.svelte.js';
	import { NETWORK } from '$lib/config-eager.js';
	import { TriangleAlert } from '@lucide/svelte';

	const networkLabel = NETWORK.charAt(0).toUpperCase() + NETWORK.slice(1);
</script>

{#if BrowserWalletState.networkMismatch}
	<div class="flex items-center gap-2 bg-destructive/10 px-4 py-3 text-sm text-destructive">
		<TriangleAlert class="size-4 shrink-0" />
		<span>
			Your wallet is connected to Mainnet. Switch to {networkLabel} in your wallet settings to use this app.
		</span>
	</div>
{/if}
