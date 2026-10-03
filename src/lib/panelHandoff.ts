import { EnvironmentManager } from './environment';
import type { PanelSession } from './panelSession';
import type { PanelUi } from './panelUi.svelte';

const fields = [
	'term',
	'datedTerm',
	'week',
	'selected',
	'groups',
	'comparison',
	'comparisonDisplay',
	'meetingDraft',
	'meetingEditorOpen',
	'meetingDetails',
	'starts',
	'preferences'
] as const;

async function identity(): Promise<string> {
	const data = await EnvironmentManager.getEnvironmentData();
	const token = data.jwt_tokens[data.current_environment] ?? '';
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
	return (
		data.current_environment +
		':' +
		Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
	);
}

export async function savePanelHandoff(
	ui: PanelUi,
	session: PanelSession,
	href: string
): Promise<string> {
	const owner = await identity();
	if (!session.active)
		throw new Error('The panel session changed. Try opening the current page again.');
	const key = 'panel-handoff-' + crypto.randomUUID();
	const state = Object.fromEntries(fields.map((field) => [field, ui[field]]));
	await chrome.storage.session.set({
		[key]: JSON.parse(
			JSON.stringify({
				owner,
				expires: Date.now() + 300000,
				state,
				preview: ui.highlightedSlot
			})
		)
	});
	if (!session.active) {
		await chrome.storage.session.remove(key);
		throw new Error('The panel session changed. Try opening the current page again.');
	}
	const url = new URL(href);
	url.searchParams.set('panel-state', key);
	return url.href;
}

export async function restorePanelHandoff(
	ui: PanelUi,
	session: PanelSession,
	href: string
): Promise<void> {
	const url = new URL(href);
	const key = url.searchParams.get('panel-state');
	if (!key?.startsWith('panel-handoff-')) return;
	const saved = (await chrome.storage.session.get(key))[key];
	await chrome.storage.session.remove(key);
	url.searchParams.delete('panel-state');
	history.replaceState(history.state, '', url);
	if (!saved || saved.expires < Date.now() || saved.owner !== (await identity()) || !session.active)
		return;
	const state = Object.fromEntries(
		fields
			.filter((field) => saved.state[field] !== undefined)
			.map((field) => [field, saved.state[field]])
	);
	Object.assign(ui, state);
	ui.datedTerm = ui.term;
	ui.restoredPreview = saved.preview;
}
