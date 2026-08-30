<script lang="ts">
	import { ConnectWalletButton } from '$lib/components/connect-wallet-button/index.js';
	import NetworkBadge from '$lib/components/network/NetworkBadge.svelte';
	import SearchBar from '$lib/components/layout/SearchBar.svelte';
	import Wordmark from '$lib/components/Wordmark.svelte';
	import { navLinks, isActive } from '$lib/navLinks.js';
	import { page } from '$app/state';
</script>

<header class="sticky top-0 z-40 bg-background/80 backdrop-blur">
	<!-- Single row: Wordmark | Links(lg+) | Search | Badge | Connect -->
	<div class="flex items-center justify-between px-4 py-3 lg:px-4 lg:py-5 xl:px-6">
		<!-- Left: Wordmark + Links -->
		<div class="flex items-center gap-16">
			<a href="/" aria-label="fundada home" class="flex shrink-0 items-center">
				<Wordmark size="xs" />
			</a>

			<nav class="hidden items-center gap-8 lg:flex">
				{#each navLinks as link (link.href)}
					<a
						href={link.href}
						class="text-base font-semibold capitalize tracking-wide transition duration-150 hover:text-foreground {isActive(
							page.url.pathname,
							link.href,
						)
							? 'text-foreground'
							: 'text-foreground/40'}"
					>
						{link.label}
					</a>
				{/each}
			</nav>
		</div>

		<!-- Right: Search | Badge + Connect -->
		<div class="flex items-center gap-4">
			<div class="hidden items-center justify-center search:flex search:w-56 xl:w-[20rem]">
				<SearchBar />
			</div>

			<a
				href="https://github.com/iupiew/fundada"
				target="_blank"
				rel="noopener noreferrer"
				aria-label="GitHub repository"
				class="shrink-0"
			>
				<img src="/GitHub_Invertocat_White.svg" alt="GitHub" class="h-5 w-auto lg:h-6" />
			</a>

			<div class="flex items-center gap-2 lg:gap-4">
				<NetworkBadge />
				<ConnectWalletButton />
			</div>
		</div>
	</div>
</header>
