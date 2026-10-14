export function extensionPageUrl(href: string, view?: string): string {
	const current = new URL(href);
	let path = current.pathname.replace(/^\/+|\/+$/g, '');
	if (!path) path = 'index.html';
	else if (!path.endsWith('.html')) path += '.html';

	const url = new URL(chrome.runtime.getURL(path));
	url.search = current.search;
	url.hash = current.hash;
	if (view) url.searchParams.set('view', view);
	return url.href;
}

export async function openPageInTab(href: string, windowId: number, view?: string): Promise<void> {
	const url = extensionPageUrl(href, view);
	const opening = chrome.tabs.create({ url, windowId, active: true });
	const panel = chrome.sidePanel as typeof chrome.sidePanel & {
		close?: (options: { windowId: number }) => Promise<void>;
	};
	const closePanel = () =>
		panel?.close?.({ windowId }).catch((error) => {
			console.error('Error closing extension sidebar:', error);
		});

	if (url.startsWith('moz-extension:')) {
		void closePanel();
		await opening;
	} else {
		await opening;
		await closePanel();
	}
}

type TabWithStore = chrome.tabs.Tab & { cookieStoreId?: string };

async function witContainerId(): Promise<string | undefined> {
	try {
		const witTabs = (await chrome.tabs.query({
			url: 'https://selfservice.wit.edu/*'
		})) as TabWithStore[];
		const fromTab = witTabs.find(
			(tab) => tab.cookieStoreId && tab.cookieStoreId !== 'firefox-default'
		);
		if (fromTab?.cookieStoreId) return fromTab.cookieStoreId;

		const storeIds = new Set<string>();
		for (const store of await chrome.cookies.getAllCookieStores()) storeIds.add(store.id);
		for (const identity of (await (globalThis as any).browser?.contextualIdentities?.query({})) ??
			[]) {
			storeIds.add(identity.cookieStoreId);
		}

		for (const storeId of storeIds) {
			if (storeId === 'firefox-default') continue;
			const cookies = await chrome.cookies.getAll({ url: 'https://selfservice.wit.edu/', storeId });
			if (cookies.length) return storeId;
		}
	} catch {
		return undefined;
	}
}

export async function createWitTab(url: string): Promise<chrome.tabs.Tab> {
	const cookieStoreId = await witContainerId();
	try {
		return await chrome.tabs.create({
			url,
			...(cookieStoreId ? { cookieStoreId } : {})
		} as chrome.tabs.CreateProperties);
	} catch {
		return await chrome.tabs.create({ url });
	}
}
