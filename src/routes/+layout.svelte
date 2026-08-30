<script lang="ts">
	import '../app.css';
	import Header from '$lib/components/layout/Header.svelte';
	import BottomNav from '$lib/components/layout/BottomNav.svelte';
	import NetworkBanner from '$lib/components/layout/NetworkBanner.svelte';
	import Wordmark from '$lib/components/Wordmark.svelte';
	import { onMount } from 'svelte';
	import { reconnectWallet } from '$lib/state/browser-wallet-state.svelte.js';

	let { children } = $props();

	onMount(() => {
		document.getElementById('sk-skeleton')?.remove();
		reconnectWallet();
	});
</script>

<svelte:head>
	<title>fundada</title>
</svelte:head>

<div class="flex min-h-screen flex-col bg-background">
	<Header />
	<NetworkBanner />

	<main class="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-24 sm:pt-12 lg:pb-12">
		{@render children()}
	</main>

	<footer class="py-6">
		<div class="flex justify-center opacity-30">
			<Wordmark size="xs" />
		</div>
	</footer>

	<BottomNav />
</div>
