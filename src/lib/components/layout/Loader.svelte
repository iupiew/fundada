<script lang="ts">
	import Wordmark from '$lib/components/Wordmark.svelte';

	let {
		size = 'md',
		fullScreen = false,
	}: { size?: 'xs' | 'sm' | 'md' | 'lg'; fullScreen?: boolean } = $props();
</script>

<div
	class="flex items-center justify-center bg-background {fullScreen
		? 'min-h-screen'
		: 'min-h-[60vh]'}"
>
	<div class="animate-pulse">
		<Wordmark {size} />
	</div>
</div>
