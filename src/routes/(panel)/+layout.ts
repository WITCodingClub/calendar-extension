import { browser } from '$app/environment';
import { resolve } from '$app/paths';
import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = ({ url }) => {
	if (!browser) return;
	const view = url.searchParams.get('view');
	const returnToSettings = sessionStorage.getItem('returnToSettings') === 'true';
	if (returnToSettings || view === 'settings' || view === 'help') {
		sessionStorage.removeItem('returnToSettings');
		sessionStorage.removeItem('clearCalendarData');
		let destination: string = resolve(
			returnToSettings || view === 'settings' ? '/settings' : '/help'
		);
		if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:')
			destination += '.html';
		redirect(307, destination);
	}
};
