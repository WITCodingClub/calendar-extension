<script lang="ts">
	import { API } from '$lib/api';
	import { getPanelUi } from '$lib/panel/ui.svelte';
	import { getPanelSession } from '$lib/panel/session';
	import { campusDate, shiftDate } from '$lib/datetime';
	import type { MeetingLink } from '$lib/types';
	import MeetingLinksView from './MeetingLinksView.svelte';
	import MeetingLinkDetails from './MeetingLinkDetails.svelte';
	const ui = getPanelUi();
	const session = getPanelSession();
	let manager: MeetingLinksView | undefined = $state();
	let links = $state<MeetingLink[]>([]);
	let booking = $state<MeetingLink | null>(null);
	let bookingOpen = $state(false);
	let bookingLoading = $state(false);
	let bookingError = $state('');
	let bookingVersion = 0;
	const current = () => {
		if (!session.active) throw new Error('The session ended. Reopen your meeting links.');
	};
	export function isBusy() {
		return Boolean(manager?.isBusy()) || bookingLoading;
	}
	export async function reload() {
		if (session.active && !isBusy()) await manager?.reload();
	}
	async function openBooking(id: string) {
		if (bookingLoading || !session.active) return;
		const link = links.find((item) => item.booking?.meeting_id === id);
		if (!link?.booking) return;
		const version = ++bookingVersion;
		bookingLoading = true;
		bookingError = '';
		booking = link;
		try {
			if (ui.meetingEventsEnabled) {
				const result = await API.getSavedMeeting(id);
				current();
				const start = campusDate(result.meeting.start_time);
				const end = shiftDate(campusDate(result.meeting.end_time), 1);
				const response = await API.getSavedMeetings(start, end);
				current();
				if (version !== bookingVersion) return;
				const meeting = response.meetings.find((item) => item.id === id);
				const occurrence = response.occurrences.find(
					(item) =>
						item.meeting_id === id &&
						Date.parse(item.start_time) === Date.parse(result.meeting.start_time)
				);
				if (meeting && occurrence) {
					ui.savedMeetingDetail = { meeting, occurrence };
					return;
				}
			}
			bookingOpen = true;
		} catch (failure) {
			if (session.active && version === bookingVersion) {
				bookingError =
					failure instanceof Error
						? failure.message
						: 'Could not load the saved meeting. Showing the booking summary.';
				bookingOpen = true;
			}
		} finally {
			if (session.active && version === bookingVersion) bookingLoading = false;
		}
	}
</script>

<MeetingLinksView
	bind:this={manager}
	now={ui.now}
	initialFrom={ui.preferences.from}
	initialUntil={ui.preferences.until}
	initialDuration={ui.preferences.duration}
	bind:uncertain={ui.linkUncertain}
	onbusy={(value) => (ui.linkBusy = value)}
	onload={async () => {
		current();
		const response = await API.getMeetingLinks();
		current();
		links = response.meeting_links;
		return links;
	}}
	oncreate={async (input) => {
		current();
		const response = await API.createMeetingLink(input);
		current();
		return response.meeting_link;
	}}
	onrevoke={async (id) => {
		current();
		const response = await API.revokeMeetingLink(id);
		current();
		links = links.map((item) => (item.id === id ? response.meeting_link : item));
		return response.meeting_link;
	}}
	onmeeting={(id) => void openBooking(id)}
/>
{#if bookingLoading}<p class="text-sm text-on-surface-variant" role="status">
		Loading meeting details…
	</p>{/if}
<MeetingLinkDetails
	bind:open={bookingOpen}
	link={booking}
	error={bookingError}
	onretry={booking ? () => void openBooking(booking!.booking!.meeting_id) : undefined}
/>
