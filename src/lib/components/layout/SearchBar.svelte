<script lang="ts">
	import { goto } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import { cubicInOut } from 'svelte/easing';
	import { Search, X } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { fetchCampaigns, shortPkh, type OnChainCampaign } from '$lib/campaigns.svelte.js';

	let query = $state('');
	let filtered = $state<OnChainCampaign[]>([]);
	let loading = $state(false);
	let open = $state(false);
	let mobileOpen = $state(false);
	let activeIndex = $state(-1);

	let cache: { ts: number; data: OnChainCampaign[] } | null = null;
	const CACHE_TTL = 30_000;
	let debounceId: ReturnType<typeof setTimeout> | null = null;

	async function getCampaigns(): Promise<OnChainCampaign[]> {
		const now = Date.now();
		if (cache && now - cache.ts < CACHE_TTL) return cache.data;
		loading = true;
		try {
			const data = await fetchCampaigns();
			cache = { ts: now, data };
			return data;
		} catch {
			return [];
		} finally {
			loading = false;
		}
	}

	function onInput() {
		if (debounceId) clearTimeout(debounceId);
		const q = query.trim();
		if (q.length < 2) {
			filtered = [];
			open = false;
			return;
		}
		debounceId = setTimeout(async () => {
			const all = await getCampaigns();
			const lower = q.toLowerCase();
			filtered = all
				.filter(
					(c) =>
						c.title.toLowerCase().includes(lower) ||
						c.campaignId.toLowerCase().startsWith(lower),
				)
				.slice(0, 6);
			open = filtered.length > 0;
			activeIndex = -1;
		}, 300);
	}

	function navigate(campaignId: string) {
		goto('/campaign?id=' + encodeURIComponent(campaignId));
		query = '';
		filtered = [];
		open = false;
		mobileOpen = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			const q = query.trim();
			if (activeIndex >= 0 && filtered[activeIndex]) {
				navigate(filtered[activeIndex].campaignId);
			} else if (filtered.length === 1) {
				navigate(filtered[0].campaignId);
			} else if (q) {
				navigate(q);
			}
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (filtered.length > 0) {
				activeIndex = Math.min(activeIndex + 1, filtered.length - 1);
				open = true;
			}
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			activeIndex = Math.max(activeIndex - 1, -1);
		} else if (e.key === 'Escape') {
			open = false;
			mobileOpen = false;
		}
	}

	function onBlur() {
		setTimeout(() => (open = false), 150);
	}
</script>

<!-- Desktop inline search -->
<div class="relative hidden w-full sm:block">
	<div class="relative flex items-center">
		<Input
			type="search"
			bind:value={query}
			oninput={onInput}
			onkeydown={onKeydown}
			onblur={onBlur}
			placeholder="Search campaigns…"
			class="h-8 rounded-xl border-0 bg-[#18181b] px-3 text-sm font-semibold text-foreground shadow-none placeholder:font-medium placeholder:text-foreground/60 dark:bg-[#18181b]"
		/>
		{#if loading}
			<span class="absolute right-3 size-3 animate-pulse rounded-full bg-primary/60"></span>
		{/if}
	</div>

	{#if open && filtered.length > 0}
		<div
			class="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl bg-popover shadow-lg"
		>
			{#each filtered as c, i (c.campaignId)}
				<button
					type="button"
					onclick={() => navigate(c.campaignId)}
					class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted {i ===
					activeIndex
						? 'bg-muted'
						: ''}"
				>
					<span class="size-1.5 shrink-0 rounded-full bg-primary"></span>
					<span class="line-clamp-1 flex-1 font-medium text-foreground">{c.title}</span>
					<span class="shrink-0 font-mono text-[10px] text-muted-foreground">
						{shortPkh(c.founderPkh)}
					</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<!-- Mobile search icon + overlay -->
<div class="sm:hidden">
	<Button
		variant="ghost"
		size="icon-sm"
		aria-label="Search campaigns"
		onclick={() => (mobileOpen = !mobileOpen)}
	>
		{#if mobileOpen}
			<X class="size-4" />
		{:else}
			<Search class="size-4" />
		{/if}
	</Button>

	{#if mobileOpen}
		<div
			transition:slide={{ duration: 250, easing: cubicInOut }}
			class="fixed inset-x-0 top-[57px] z-50 bg-background px-4 py-3 sm:hidden"
		>
			<div class="relative flex items-center">
<Search class="pointer-events-none absolute left-3 size-4 text-foreground" />
			<Input
				type="search"
				bind:value={query}
				oninput={onInput}
				onkeydown={onKeydown}
				placeholder="Search campaigns…"
				class="h-9 rounded-xl border-0 bg-[#18181b] pl-9 text-sm font-semibold text-foreground shadow-none placeholder:font-medium placeholder:text-foreground/60 dark:bg-[#18181b]"
				/>
				{#if loading}
					<span class="absolute right-3 size-3 animate-pulse rounded-full bg-primary/60"></span>
				{/if}
			</div>

			{#if open && filtered.length > 0}
				<div class="mt-1.5 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
					{#each filtered as c, i (c.campaignId)}
						<button
							type="button"
							onclick={() => navigate(c.campaignId)}
							class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted {i ===
							activeIndex
								? 'bg-muted'
								: ''}"
						>
							<span class="size-1.5 shrink-0 rounded-full bg-primary"></span>
							<span class="line-clamp-1 flex-1 font-medium text-foreground">{c.title}</span>
							<span class="shrink-0 font-mono text-[10px] text-muted-foreground">
								{shortPkh(c.founderPkh)}
							</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
