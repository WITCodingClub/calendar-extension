<script lang="ts">
	import { Button, TextFieldOutlined } from 'm3-svelte';
	import PreviewDialog from './PreviewDialog.svelte';
	import { shiftDate, todayDate } from '$lib/calendarDates';
	let creating = $state(false);
</script>

<section
	class="min-w-0 gap-4 rounded-2xl border-outline-variant/65 bg-surface-container-low p-4 grid border"
	aria-labelledby="preview-links-title"
>
	<div
		class="gap-3 [&_p]:mt-1 [&_p]:text-sm [&_p]:text-on-surface-variant flex flex-wrap items-center justify-between"
	>
		<div>
			<h3 id="preview-links-title">One-time meeting links</h3>
		</div>
		<Button variant="outlined" onclick={() => (creating = true)}>Create meeting link</Button>
	</div>
	<PreviewDialog bind:open={creating} title="Create meeting link">
		<div class="gap-4 grid">
			<div
				class="preview-fields min-w-0 gap-4 pt-1 grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))]"
			>
				<TextFieldOutlined label="Link name" value="" /><TextFieldOutlined
					label="Link expires"
					type="date"
					value={shiftDate(todayDate(), 7)}
				/>
			</div>
			<p class="text-sm text-on-surface-variant">
				Uses the date range and duration selected for your meeting.
			</p>
			<Button disabled>Generate link</Button>
		</div>
	</PreviewDialog>
</section>
