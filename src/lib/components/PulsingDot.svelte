<script lang="ts">
	let { size = 'size-1.5 lg:size-2' }: { size?: string } = $props();
</script>

<span class="relative flex {size} shrink-0">
	<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75"></span>
	<span class="relative inline-flex {size} rounded-full bg-green-500"></span>
</span>
