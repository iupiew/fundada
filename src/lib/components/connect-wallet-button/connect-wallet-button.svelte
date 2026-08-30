<script lang="ts">
	import { onMount } from 'svelte';
	import type { Wallet } from '@meshsdk/core';
	import {
		BrowserWalletState,
		connectWallet,
		disconnectWallet,
	} from '$lib/state/browser-wallet-state.svelte.js';
	import { type ConnectWalletButtonProps } from '.';
	import { NETWORK } from '$lib/config-eager.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { LoaderCircle, ChevronRight } from '@lucide/svelte';

	const { label = 'Connect' }: ConnectWalletButtonProps = $props();

	let availableWallets: Wallet[] = $state([]);
	let modalOpen = $state(false);

	const connected = $derived(!!BrowserWalletState.browserWallet);

	onMount(() => {
		import('@meshsdk/core').then(({ BrowserWallet }) => {
			BrowserWallet.getAvailableWallets().then((aw: Wallet[]) => {
				availableWallets = aw;
			});
		});
	});

	async function select(wallet: Wallet) {
		await connectWallet(wallet);
		if (BrowserWalletState.browserWallet) modalOpen = false;
	}
</script>

<Dialog.Root bind:open={modalOpen}>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Button variant="default" {...props} class="rounded-xl px-[0.45rem] text-xs font-semibold lg:px-4 lg:text-base {connected ? 'bg-accent-soft text-foreground' : ''}">
				{#if BrowserWalletState.connecting}
					<LoaderCircle class="animate-spin" data-icon="inline-start" />
					Connecting…
				{:else if !connected}
					{label}
				{:else if BrowserWalletState.wallet && BrowserWalletState.lovelaceBalance}
					<span class="font-semibold text-foreground">₳</span>
					{(parseInt(BrowserWalletState.lovelaceBalance, 10) / 1_000_000).toLocaleString(
						undefined,
						{
							minimumFractionDigits: 2,
							maximumFractionDigits: 2,
						},
					)}
				{:else}
					{BrowserWalletState.walletName ?? 'Connected'}
				{/if}
			</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{connected ? 'Wallet' : 'Connect a wallet'}</Dialog.Title>
			<Dialog.Description>
				{connected
					? BrowserWalletState.walletName ?? 'Connected'
					: 'Choose a Cardano wallet to continue'}
			</Dialog.Description>
		</Dialog.Header>

		{#if !connected && availableWallets.length > 0}
			{#if BrowserWalletState.connectError}
				<p class="rounded-2xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
					{BrowserWalletState.connectError}
				</p>
			{/if}
			<div class="flex flex-col gap-2">
				{#each availableWallets as enabledWallet (enabledWallet.id)}
					<Button
						variant="secondary"
						class="h-auto w-full justify-start gap-3 px-4 py-3 font-normal"
						onclick={() => select(enabledWallet)}
						disabled={BrowserWalletState.connecting}
					>
						<img
							alt={enabledWallet.name + ' wallet icon'}
							class="h-7 w-7"
							src={enabledWallet.icon}
						/>
						<span class="font-medium">
							{enabledWallet.name
								.split(' ')
								.map(
									(word: string) =>
										word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
								)
								.join(' ')}
						</span>
						{#if BrowserWalletState.connecting}
							<LoaderCircle class="ml-auto animate-spin" />
						{:else}
							<ChevronRight class="ml-auto text-muted-foreground" />
						{/if}
					</Button>
				{/each}
			</div>
		{:else if !connected && availableWallets.length === 0}
			<div class="py-6 text-center">
				<p class="text-sm text-muted-foreground">No wallet found</p>
				<div class="mt-3 space-y-2 text-left text-xs text-muted-foreground/70">
					<p>
						<span class="font-semibold text-muted-foreground">Desktop:</span>
						Install a Cardano wallet extension like Eternl, Lace or Vespr.
					</p>
					<p>
						<span class="font-semibold text-muted-foreground">Mobile:</span>
						Open this page inside your wallet app's dApp browser
						(Lace Mobile, Eternl, or any CIP-30 compatible wallet).
					</p>
				</div>
			</div>
		{:else if connected}
			{#if BrowserWalletState.lovelaceBalance}
				<div class="flex items-center justify-between rounded-2xl border border-border bg-muted/50 px-4 py-3">
					<span class="text-sm text-muted-foreground">Balance</span>
					<span class="text-sm font-semibold">
						₳ {(parseInt(BrowserWalletState.lovelaceBalance, 10) / 1_000_000).toLocaleString(
							undefined,
							{ minimumFractionDigits: 2, maximumFractionDigits: 2 },
						)}
					</span>
				</div>
			{/if}
			<Button
				variant="destructive"
				class="w-full"
				onclick={() => {
					disconnectWallet();
					modalOpen = false;
				}}
			>
				Disconnect
			</Button>
		{/if}

		<Separator />
		<p class="text-center text-xs text-muted-foreground">
			By connecting a wallet you agree to interact with the Cardano {NETWORK} network.
		</p>
	</Dialog.Content>
</Dialog.Root>
