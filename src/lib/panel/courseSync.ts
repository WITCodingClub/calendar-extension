import { writable } from 'svelte/store';
import { snackbar } from 'm3-svelte';
import { AuthError } from '../auth/session';
import { StudentPageAuthError } from '../calendar/academicProfile';
import { backfillAcademicData } from '../calendar/academicSync';
import { backfillPastTerms, type ImportedTerms } from '../calendar/leopardWeb';
import type { PanelSession } from './session';

type CourseSyncStatus = { message: string; running: boolean; loginUrl?: string };

const syncs = new WeakMap<PanelSession, ReturnType<typeof createCourseSync>>();

export function getCourseSync(session: PanelSession) {
	let sync = syncs.get(session);
	if (!sync) {
		sync = createCourseSync(session);
		syncs.set(session, sync);
	}
	return sync;
}

function createCourseSync(session: PanelSession) {
	const status = writable<CourseSyncStatus>({ message: '', running: false });
	let pending: Promise<void> | undefined;
	async function execute(imported?: ImportedTerms, retry = false) {
		if (!session.active) return;
		status.update((state) => ({ ...state, running: true }));
		try {
			if (retry) session.backfills.resetAttempts();
			const pastTerms = await backfillPastTerms(session, imported);
			if (!session.active) return;
			if (pastTerms && !pastTerms.complete)
				throw new Error('Some course history could not be synced. Select Retry to try again.');
			const academic = await backfillAcademicData(
				session.backfills,
				() => session.active,
				Boolean(imported)
			);
			if (!session.active) return;
			if (academic && !academic.complete)
				throw new Error(academic.warnings.join(' ') || 'Academic data could not be synced.');
			status.set({ message: '', running: false });
			if (academic?.complete)
				snackbar(
					pastTerms?.complete
						? 'Your course history is up to date and your academic profile information has been sent.'
						: 'Your academic profile information and course outcomes have been sent.'
				);
			else if (pastTerms?.complete) snackbar('Your course history is up to date.');
			if (academic?.warnings.length) snackbar(academic.warnings.join(' '), undefined, true);
		} catch (error) {
			if (!session.active || error instanceof AuthError) return;
			status.set({
				message: `Course history and academic sync did not finish. ${error instanceof Error ? error.message : 'Select Retry to try again.'}`,
				running: false,
				loginUrl: error instanceof StudentPageAuthError ? error.url : undefined
			});
		} finally {
			if (session.active) status.update((state) => ({ ...state, running: false }));
		}
	}
	return {
		subscribe: status.subscribe,
		run(imported?: ImportedTerms, retry = false): Promise<void> {
			if (pending && !imported && !retry) return pending;
			const previous = pending;
			const request = (
				previous ? previous.then(() => execute(imported, retry)) : execute(imported, retry)
			).finally(() => {
				if (pending === request) pending = undefined;
			});
			pending = request;
			return request;
		}
	};
}
