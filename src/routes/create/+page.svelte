<script lang="ts">
	import { goto } from '$app/navigation';
	import { CalendarDate, getLocalTimeZone } from '@internationalized/date';
	import { BrowserWalletState, withWallet } from '$lib/state/browser-wallet-state.svelte.js';
	import { CampaignStore } from '$lib/campaign-store.svelte.js';
	import { buildCreateCampaignTx, signAndSubmit } from '$lib/fundada.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Calendar } from '$lib/components/ui/calendar/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { encodeLinks, isValidHttpUrl, IMAGE_LINK_LABEL } from '$lib/campaign-links.js';
	import { LoaderCircle, CalendarIcon, TriangleAlert, CheckCircle2 } from '@lucide/svelte';

	let title = $state('');
	let description = $state('');
	let goalAda = $state('10');
	let coverImageUrl = $state('');
	let coverImageError = $state('');
	let error = $state('');
	let txHash = $state('');
	let successCampaignId = $state('');
	let submitting = $state(false);
	let step = $state('');
	let calendarOpen = $state(false);

	const seedPledgeAda = 2;

	// Default deadline: one week from now at 23:59 — never empty, so the
	// "Title and deadline are required" failure can't happen by accident.
	let deadline = $state((() => {
		const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
		d.setHours(23, 59, 0, 0);
		return d;
	})());

	const deadlineDateValue = $derived(
		new CalendarDate(deadline.getFullYear(), deadline.getMonth() + 1, deadline.getDate()),
	);

	function applyDate(value: CalendarDate) {
		const d = value.toDate(getLocalTimeZone());
		d.setHours(deadline.getHours(), deadline.getMinutes(), 0, 0);
		deadline = d;
	}

	async function submit() {
		error = '';
		coverImageError = '';
		txHash = '';
		successCampaignId = '';
		const wallet = BrowserWalletState.browserWallet;
		if (!wallet) {
			error = 'Connect a wallet first.';
			return;
		}
		if (BrowserWalletState.networkMismatch) {
			error = 'Your wallet is on the wrong network. Switch to Preprod to continue.';
			return;
		}
		if (!title.trim()) {
			error = 'Title is required.';
			return;
		}
		const trimmedImageUrl = coverImageUrl.trim();
		if (trimmedImageUrl && !isValidHttpUrl(trimmedImageUrl)) {
			coverImageError = 'Cover image must be a valid http(s) URL.';
			return;
		}
		const deadlineMs = deadline.getTime();
		if (isNaN(deadlineMs)) {
			error = 'Invalid deadline.';
			return;
		}
		if (deadlineMs <= Date.now()) {
			error = 'Deadline must be in the future.';
			return;
		}
		const goalLovelace = Math.round(Number(goalAda) * 1_000_000);
		if (goalLovelace <= 0) {
			error = 'Goal must be greater than zero.';
			return;
		}

		submitting = true;
		step = '';
		try {
			const links = encodeLinks(
				trimmedImageUrl ? [{ label: IMAGE_LINK_LABEL, url: trimmedImageUrl }] : [],
			);
			await withWallet(async (wallet) => {
				step = 'Building transaction…';
				const { txHex, campaignId, founderPkh } = await buildCreateCampaignTx(wallet, {
					goalLovelace,
					deadlineMs,
					title: title.trim(),
					description: description.trim(),
					links,
					seedLovelace: seedPledgeAda * 1_000_000,
				});
				CampaignStore.set({
					campaignId,
					title: title.trim(),
					description: description.trim(),
					goalLovelace,
					deadline: deadlineMs,
					founderPkh,
					links,
					createdAt: Date.now(),
				});
				step = 'Waiting for wallet confirmation…';
				txHash = await signAndSubmit(wallet, txHex);
				successCampaignId = campaignId;
			});
			setTimeout(() => {
				if (successCampaignId) {
					goto('/campaign?id=' + encodeURIComponent(successCampaignId));
				}
			}, 3000);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			submitting = false;
			step = '';
		}
	}
</script>

<section class="mx-auto max-w-lg">
	<Card.Root class="border-0 bg-[#09090b]">
		<Card.Content class="grid gap-5">
			<div class="grid gap-2">
				<Label for="title">Title</Label>
				<Input id="title" bind:value={title} placeholder="Help us build a community garden" class="border-0 bg-[#18181b] shadow-none dark:bg-[#18181b]" />
			</div>

			<div class="grid gap-2">
				<Label for="description">Description</Label>
				<Textarea
					id="description"
					bind:value={description}
					placeholder="What are you raising funds for?"
					rows={3}
					class="border-0 bg-[#18181b] shadow-none dark:bg-[#18181b]"
				/>
			</div>

			<div class="grid gap-2">
				<Label for="goal">Funding goal (ADA)</Label>
				<Input id="goal" type="number" min="1" step="1" bind:value={goalAda} class="border-0 bg-[#18181b] shadow-none dark:bg-[#18181b]" />
			</div>

			<div class="grid gap-2">
				<Label for="cover-image">Cover image URL (optional)</Label>
				<Input
					id="cover-image"
					type="text"
					bind:value={coverImageUrl}
					placeholder="https://example.com/cover.jpg"
					aria-invalid={!!coverImageError}
					class="border-0 bg-[#18181b] shadow-none dark:bg-[#18181b]"
				/>
				{#if coverImageError}
					<p class="text-xs text-destructive">{coverImageError}</p>
				{/if}
			</div>

			<div class="grid gap-2">
				<Label>Deadline</Label>
				<Popover.Root bind:open={calendarOpen}>
					<Popover.Trigger>
						{#snippet child({ props })}
						<Button
							variant="secondary"
							{...props}
							class="w-full justify-start bg-[#18181b] font-normal text-foreground shadow-none hover:bg-[#18181b]"
						>
								<CalendarIcon data-icon="inline-start" />
								{deadline.toLocaleDateString(undefined, {
									weekday: 'short',
									year: 'numeric',
									month: 'short',
									day: 'numeric',
								})}
							</Button>
						{/snippet}
					</Popover.Trigger>
					<Popover.Content class="w-auto p-0" align="start">
						<Calendar
							type="single"
							value={deadlineDateValue}
							onValueChange={(v) => {
								if (v) applyDate(v as CalendarDate);
								calendarOpen = false;
							}}
						/>
					</Popover.Content>
				</Popover.Root>
				<p class="text-xs text-muted-foreground">
					Pledging closes {deadline.toLocaleString()}
				</p>
			</div>

			{#if error}
				<Alert variant="destructive">
					<TriangleAlert />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			{/if}
		{#if txHash}
			<Alert>
				<CheckCircle2 />
				<AlertDescription class="break-all">Tx submitted: {txHash}</AlertDescription>
			</Alert>
		{/if}
		{#if successCampaignId}
			<Alert>
				<CheckCircle2 />
				<AlertDescription>
					Campaign created successfully! It will appear shortly.
					<span class="mt-1 block break-all text-xs text-muted-foreground">
						ID: {successCampaignId}
					</span>
				</AlertDescription>
			</Alert>
			<Button href="/campaign?id={successCampaignId}" variant="secondary" class="w-full">
				View campaign →
			</Button>
		{/if}

			<Button onclick={submit} disabled={submitting || BrowserWalletState.networkMismatch} class="w-full py-5">
				{#if submitting}
					<LoaderCircle class="animate-spin" data-icon="inline-start" />
					{step || 'Submitting…'}
				{:else}
					Create campaign
				{/if}
			</Button>

			<p class="text-xs leading-relaxed text-muted-foreground">
				Creating the campaign mints a one-shot thread token and locks a small seed
				pledge with the campaign parameters (founder, goal, deadline, metadata) on-chain.
				The goal must be met by the deadline or every backer — including the founder —
				can reclaim their pledge.
			</p>
		</Card.Content>
	</Card.Root>
</section>
