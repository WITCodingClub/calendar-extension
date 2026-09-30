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
    const closePanel = () => panel?.close?.({ windowId }).catch((error) => {
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
