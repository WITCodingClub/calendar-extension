type TabWithStore = chrome.tabs.Tab & { cookieStoreId?: string };

async function witContainerId(): Promise<string | undefined> {
	try {
		const witTabs = (await chrome.tabs.query({ url: 'https://selfservice.wit.edu/*' })) as TabWithStore[];
		const fromTab = witTabs.find((tab) => tab.cookieStoreId && tab.cookieStoreId !== 'firefox-default');
		if (fromTab?.cookieStoreId) return fromTab.cookieStoreId;

		const storeIds = new Set<string>();
		for (const store of await chrome.cookies.getAllCookieStores()) storeIds.add(store.id);
		for (const identity of (await (globalThis as any).browser?.contextualIdentities?.query({})) ?? []) {
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
		return await chrome.tabs.create({ url, ...(cookieStoreId ? { cookieStoreId } : {}) } as chrome.tabs.CreateProperties);
	} catch {
		return await chrome.tabs.create({ url });
	}
}
