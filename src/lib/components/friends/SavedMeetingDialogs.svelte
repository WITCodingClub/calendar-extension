<script lang="ts">
	import { tick } from 'svelte';
	import { API } from '$lib/api';
	import { getPanelUi } from '$lib/panel/ui.svelte';
	import { getPanelSession } from '$lib/panel/session';
	import { userSettings } from '$lib/stores';
	import SavedMeetingDetail from './SavedMeetingDetail.svelte';
	const ui = getPanelUi();
	const session = getPanelSession();
	let returnTarget: HTMLElement | null = null;
	$effect(() => {
		if (ui.savedMeetingDetail) returnTarget = document.activeElement as HTMLElement;
	});
	async function close() {
		ui.savedMeetingDetail = undefined;
		await tick();
		await Promise.allSettled([...session.pendingSavedMeetings.values()]);
		await tick();
		if (returnTarget?.isConnected) returnTarget.focus();
		else
			document
				.querySelector<HTMLButtonElement>(
					'[aria-label="Refresh saved meetings"], .comparison button'
				)
				?.focus();
	}
</script>

{#if ui.savedMeetingDetail}
	{#key ui.savedMeetingDetail.occurrence.id}
		<SavedMeetingDetail
			meeting={ui.savedMeetingDetail.meeting}
			occurrence={ui.savedMeetingDetail.occurrence}
			militaryTime={$userSettings?.military_time ?? true}
			onsave={async (id, changes) => {
				if (!session.active) throw new Error('The session ended. Reopen your meetings.');
				const response = await API.updateSavedMeeting(id, changes);
				if (!session.active) throw new Error('The session ended. Reopen your meetings.');
				ui.invalidateMeetings(session);
				return response.meeting;
			}}
			ondelete={async (id) => {
				if (!session.active) throw new Error('The session ended. Reopen your meetings.');
				await API.deleteSavedMeeting(id);
				if (session.active) ui.invalidateMeetings(session);
			}}
			onleave={async (id) => {
				if (!session.active) throw new Error('The session ended. Reopen your meetings.');
				await API.leaveSavedMeeting(id);
				if (session.active) ui.invalidateMeetings(session);
			}}
			onupdate={close}
			onremoved={() => void close()}
			onclose={() => void close()}
			onbusy={(value) => (ui.savedMeetingBusy = value)}
		/>
	{/key}
{/if}
