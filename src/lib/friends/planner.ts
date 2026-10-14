import { meetingSlot, meetingMessage, scheduleAvailability } from './availability';
import { busyEndMinutes } from './schedule';
import { timeMinutes } from '../datetime';
import type { FreePeriod, MeetingDraft, PlannerSlot, PlannerDraft } from './types';
import type { PanelUi } from '../panel/ui.svelte';

export function suggestedMeetings(periods: FreePeriod[], duration: number): PlannerSlot[] {
	return periods.flatMap((period) => {
		const first = Math.ceil(period.start / 15) * 15;
		if (!Number.isInteger(duration) || duration <= 0 || first + duration > period.end) return [];
		return Array.from(
			{ length: Math.floor((period.end - duration - first) / 15) + 1 },
			(_, index) => {
				const start = first + index * 15;
				return { id: `${period.id}-${start}`, date: period.date, start, end: start + duration };
			}
		);
	});
}

export function copyDraft(draft: MeetingDraft): MeetingDraft {
	return {
		...draft,
		period: { ...draft.period },
		slot: { ...draft.slot },
		destinations: [...draft.destinations]
	};
}

export function openMeetingDraft(ui: PanelUi, period: FreePeriod, start: number, duration: number) {
	ui.editorReturnTarget = document.activeElement as HTMLElement;
	if (ui.meetingDraft?.submission) {
		ui.meetingEditorOpen = true;
		return;
	}
	const saved = ui.savedDraft;
	ui.meetingDraft = {
		period: { ...period },
		slot: meetingSlot(period, start, duration),
		title: saved?.title ?? '',
		location: saved?.location ?? '',
		destinations: saved ? [...saved.destinations] : ['ics'],
		destinationDefaultsPending: !saved,
		inviteFriends: saved?.inviteFriends ?? true,
		frequency: saved?.frequency ?? 'one_time',
		idempotencyKey: crypto.randomUUID()
	};
	ui.highlightedSlot = undefined;
	ui.restoredPreview = undefined;
	ui.meetingEditorOpen = true;
}

export function continueMeetingDraft(ui: PanelUi) {
	if (!ui.savedDraft && !ui.meetingDraft?.submission) return;
	ui.editorReturnTarget = document.activeElement as HTMLElement;
	if (!ui.meetingDraft?.submission) ui.meetingDraft = copyDraft(ui.savedDraft!);
	ui.meetingEditorOpen = true;
}

export function draftSummary(ui: PanelUi): PlannerDraft | null {
	const draft = ui.savedDraft;
	return draft
		? {
				title: draft.title,
				date: draft.slot.date,
				start: Number(draft.slot.start.slice(0, 2)) * 60 + Number(draft.slot.start.slice(3, 5)),
				end: Number(draft.slot.end.slice(0, 2)) * 60 + Number(draft.slot.end.slice(3, 5)),
				participantNames: ui.people
					.filter((person) => ui.selected.includes(person.id))
					.map((person) => person.name),
				location: draft.location,
				frequency: draft.frequency,
				calendar: draft.destinations.join(','),
				invite: draft.inviteFriends
			}
		: null;
}

export function editorMessage(
	ui: PanelUi,
	ownCourses: import('../types').Course[] | undefined,
	slot: import('./types').PreviewSlot
): string | undefined {
	if (slot.date < ui.preferences.from || slot.date > ui.preferences.until)
		return 'Choose a date within the planning dates.';
	const start = timeMinutes(slot.start);
	const end = busyEndMinutes(slot.end);
	const from = timeMinutes(ui.preferences.dailyStart);
	const until = busyEndMinutes(ui.preferences.dailyEnd);
	if (
		start === undefined ||
		end === undefined ||
		from === undefined ||
		until === undefined ||
		start < from ||
		end > until
	)
		return 'Choose a meeting within the planning hours.';
	if (end - start > 720) return 'Meetings can last up to 12 hours.';
	const message = meetingMessage(ui, ownCourses, slot);
	if (message) return message;
	const available = scheduleAvailability(ui, ownCourses, {
		...ui.preferences,
		from: slot.date,
		until: slot.date,
		duration: String(end - start)
	});
	if (available.message) return available.message;
	if (!available.periods.some((period) => period.start <= start && period.end >= end))
		return 'This time does not fit the planning filters. Choose another time.';
}
