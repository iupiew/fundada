<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { scaleSqrt } from 'd3-scale';
	import { forceSimulation, forceCenter, forceCollide, forceManyBody, forceX, forceY } from 'd3-force';
	import { select } from 'd3-selection';
	import { shortPkh } from '$lib/campaigns.svelte.js';
	import type { Pledge } from '$lib/fundada.js';

	let {
		pledges,
		goalLovelace,
	}: {
		pledges: Pledge[];
		goalLovelace: bigint;
	} = $props();

	const HEIGHT = 320;
	const MIN_R = 7;
	const MAX_R = 34;

	let svgEl: SVGSVGElement | undefined = $state();
	let width = $state(640);
	let containerEl: HTMLElement | undefined = $state();
	let simulation: any = null;

	type Node = Pledge & { x: number; y: number; r: number; short: string; ada: string };

	function adaText(amt: bigint): string {
		return (Number(amt) / 1_000_000).toLocaleString(undefined, {
			minimumFractionDigits: 0,
			maximumFractionDigits: 2,
		});
	}

	function build(): Node[] {
		const amounts = pledges.map((p) => Number(p.amount));
		const maxAmt = amounts.length ? Math.max(...amounts) : 1;
		const scale = scaleSqrt().domain([0, maxAmt]).range([MIN_R, MAX_R]);
		const cx = width / 2;
		const cy = HEIGHT / 2;
		return pledges.map((p, i) => {
			const angle = (i / Math.max(pledges.length, 1)) * Math.PI * 2;
			const offset = 40 + Math.random() * 30;
			return {
				...p,
				x: cx + Math.cos(angle) * offset,
				y: cy + Math.sin(angle) * offset,
				r: scale(Number(p.amount)),
				short: shortPkh(p.backer),
				ada: adaText(p.amount),
			};
		});
	}

	function render() {
		if (simulation) {
			simulation.stop();
			simulation = null;
		}
		if (!svgEl || pledges.length === 0) return;

		const nodes = build();
		const cx = width / 2;
		const cy = HEIGHT / 2;

		const svg = select(svgEl);
		svg.selectAll('*').remove();

		const tooltip = svg
			.append('g')
			.style('opacity', 0)
			.style('pointer-events', 'none');

		tooltip
			.append('rect')
			.attr('rx', 6)
			.attr('ry', 6)
			.attr('fill', '#000')
			.attr('stroke', '#27272a')
			.attr('stroke-width', 1);

		const tipText = tooltip.append('text').attr('fill', '#eaeaea').attr('font-size', 11).attr('font-family', 'Ubuntu Mono, monospace');

		const g = svg.append('g');

		const circles = g
			.selectAll<SVGCircleElement, Node>('circle')
			.data(nodes)
			.join('circle')
			.attr('r', (d) => d.r)
			.attr('fill', '#3f3f46')
			.attr('fill-opacity', 0.45)
			.attr('stroke', '#52525b')
			.attr('stroke-width', 1.5)
			.style('cursor', 'pointer')
			.on('mouseenter', (event, d) => {
				const text = `${d.short} · ₳${d.ada}`;
				tipText.text(text);
				const bbox = tipText.node()!.getBBox();
				tooltip
					.attr('transform', `translate(${d.x - bbox.width / 2 - 6}, ${d.y - d.r - bbox.height - 10})`);
				tooltip.select('rect').attr('x', -6).attr('y', 0).attr('width', bbox.width + 12).attr('height', bbox.height + 6);
				tooltip.style('opacity', 1);
			})
			.on('mouseleave', () => {
				tooltip.style('opacity', 0);
			});

		const labels = g
			.selectAll<SVGTextElement, Node>('text')
			.data(nodes)
			.join('text')
			.attr('text-anchor', 'middle')
			.attr('dy', '0.35em')
			.attr('fill', '#eaeaea')
			.attr('font-size', 10)
			.attr('font-family', 'Ubuntu Mono, monospace')
			.style('pointer-events', 'none')
			.text((d) => d.short);

		simulation = forceSimulation<Node>(nodes)
			.force('charge', forceManyBody().strength(-40))
			.force('center', forceCenter(cx, cy))
			.force('x', forceX(cx).strength(0.08))
			.force('y', forceY(cy).strength(0.08))
			.force('collide', forceCollide<Node>().radius((d) => d.r + 3).strength(0.9))
			.on('tick', () => {
				circles.attr('cx', (d) => d.x).attr('cy', (d) => d.y);
				labels.attr('x', (d) => d.x).attr('y', (d) => d.y);
			});
	}

	$effect(() => {
		pledges;
		render();
	});

	onMount(() => {
		if (typeof ResizeObserver !== 'undefined' && containerEl) {
			const ro = new ResizeObserver(() => {
				const w = containerEl?.clientWidth ?? 0;
				if (w > 0 && w !== width) {
					width = w;
					render();
				}
			});
			ro.observe(containerEl);
			onDestroy(() => ro.disconnect());
		}
	});

	onDestroy(() => {
		if (simulation) simulation.stop();
	});
</script>

<div bind:this={containerEl} class="w-full">
	{#if pledges.length === 0}
		<div class="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
			No backers yet — be the first to pledge.
		</div>
	{:else}
		<svg
			bind:this={svgEl}
			{width}
			height={HEIGHT}
			viewBox="0 0 {width} {HEIGHT}"
			class="block w-full"
			style="max-height: {HEIGHT}px"
		></svg>
	{/if}
</div>
