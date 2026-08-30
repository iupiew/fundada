<script lang="ts">
	let { size = "md" }: { size?: "xs" | "sm" | "md" | "lg" } = $props();

	const heights: Record<"xs" | "sm" | "md" | "lg", string> = {
		xs: "h-[0.55rem] lg:h-[1.05rem]",
		sm: "h-4",
		md: "h-6",
		lg: "h-10",
	};
</script>

<img
	src="/fundada-white.svg"
	alt="fundada"
	class="w-auto {heights[size]}"
/>
