<script lang="ts">
	import { navLinks, isActive } from '$lib/navLinks.js';
	import { page } from '$app/state';
</script>

<nav
	class="fixed inset-x-0 bottom-0 z-40 bg-background/80 backdrop-blur lg:hidden"
>
	<div
		class="flex items-center justify-around px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
	>
		{#each navLinks as link (link.href)}
			{@const Icon = link.icon}
			<a
				href={link.href}
				class="flex flex-col items-center gap-1 px-2 py-1 text-[10px] font-semibold capitalize tracking-wide transition duration-150 {isActive(
					page.url.pathname,
					link.href,
				)
					? 'text-foreground'
					: 'text-foreground/60'}"
			>
				{#if Icon}
					<Icon size={20} strokeWidth={1.75} />
				{/if}
				{link.label}
			</a>
		{/each}
	</div>
</nav>
