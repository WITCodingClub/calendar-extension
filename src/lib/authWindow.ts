const POPUP_WIDTH = 480;
const POPUP_HEIGHT = 720;
const FOLLOW_GRACE_MS = 1500;

function isRedirect(href: string | undefined, redirectUri: string): boolean {
    if (!href) {
        return false;
    }
    const prefix = redirectUri.replace(/\/$/, '');
    return href === prefix || href.startsWith(`${prefix}/`) || href.startsWith(`${prefix}?`);
}

function hostnameOf(href: string): string | undefined {
    try {
        return new URL(href).hostname;
    } catch {
        return undefined;
    }
}

function isContainerConfirm(href: string | undefined, createdUrl: string): boolean {
    if (!href || !href.includes('confirm-page.html')) {
        return false;
    }
    const host = hostnameOf(createdUrl);
    return !host || href.includes(encodeURIComponent(host));
}

function hostsMatch(href: string | undefined, createdUrl: string): boolean {
    const a = hostnameOf(href ?? '');
    const b = hostnameOf(createdUrl);
    return !!a && !!b && a === b;
}

async function openAuthPopup(url: string): Promise<chrome.windows.Window> {
    const screenWidth = window.screen.availWidth;
    const screenHeight = window.screen.availHeight;
    const width = Math.min(POPUP_WIDTH, screenWidth);
    const height = Math.min(POPUP_HEIGHT, screenHeight);

    let popup: chrome.windows.Window | undefined;
    try {
        popup = await chrome.windows.create({
            url,
            type: 'popup',
            width,
            height,
            left: Math.floor((screenWidth - width) / 2),
            top: Math.floor((screenHeight - height) / 2),
            focused: true
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('Invalid value for bounds')) {
            popup = await chrome.windows.create({
                url,
                type: 'popup',
                width,
                height,
                focused: true
            });
        } else {
            throw err;
        }
    }
    if (!popup) {
        throw new Error('Could not open the sign-in window');
    }
    return popup;
}

function waitForPopupRedirect(
    popup: chrome.windows.Window,
    tabId: number,
    redirectUri: string
): Promise<URLSearchParams | null> {
    return new Promise((resolve, reject) => {
        let settled = false;

        const finish = (result: URLSearchParams | null, err?: unknown) => {
            if (settled) {
                return;
            }
            settled = true;
            chrome.tabs.onUpdated.removeListener(onUpdated);
            chrome.windows.onRemoved.removeListener(onRemoved);
            if (popup.id != null) {
                chrome.windows.remove(popup.id).catch(() => {});
            }
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        };

        const onUpdated = (_id: number, info: { url?: string }, tab: chrome.tabs.Tab) => {
            if (tab.id !== tabId) {
                return;
            }
            const href = info.url ?? tab.url;
            if (!isRedirect(href, redirectUri)) {
                return;
            }
            try {
                finish(new URL(href!).searchParams);
            } catch (err) {
                finish(null, err);
            }
        };

        const onRemoved = (windowId: number) => {
            if (windowId === popup.id) {
                finish(null);
            }
        };

        chrome.tabs.onUpdated.addListener(onUpdated);
        chrome.windows.onRemoved.addListener(onRemoved);
    });
}

async function waitForFollowedTabRedirect(
    createdUrl: string,
    redirectUri: string
): Promise<URLSearchParams | null> {
    const existing = await chrome.tabs.query({});
    const ignore = new Set<number>();
    for (const tab of existing) {
        if (tab.id != null) {
            ignore.add(tab.id);
        }
    }

    return new Promise((resolve, reject) => {
        const tracked = new Set<number>();
        let settled = false;
        let cancelTimer: ReturnType<typeof setTimeout> | undefined;

        const finish = (result: URLSearchParams | null, err?: unknown) => {
            if (settled) {
                return;
            }
            settled = true;
            if (cancelTimer != null) {
                clearTimeout(cancelTimer);
            }
            chrome.tabs.onUpdated.removeListener(onUpdated);
            chrome.tabs.onCreated.removeListener(onCreated);
            chrome.tabs.onRemoved.removeListener(onRemoved);
            for (const id of tracked) {
                chrome.tabs.remove(id).catch(() => {});
            }
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        };

        const follow = (tabId: number | undefined, href: string | undefined) => {
            if (tabId == null || ignore.has(tabId)) {
                return;
            }
            if (!isContainerConfirm(href, createdUrl) && !hostsMatch(href, createdUrl)) {
                return;
            }
            tracked.add(tabId);
            if (cancelTimer != null) {
                clearTimeout(cancelTimer);
                cancelTimer = undefined;
            }
        };

        const onUpdated = (tabId: number, info: { url?: string }, tab: chrome.tabs.Tab) => {
            const href = info.url ?? tab.url;
            if (isRedirect(href, redirectUri)) {
                tracked.add(tabId);
                try {
                    finish(new URL(href!).searchParams);
                } catch (err) {
                    finish(null, err);
                }
                return;
            }
            follow(tabId, href);
        };

        const onCreated = (tab: chrome.tabs.Tab) => {
            follow(tab.id, tab.pendingUrl || tab.url);
        };

        const onRemoved = (tabId: number) => {
            if (!tracked.has(tabId)) {
                return;
            }
            tracked.delete(tabId);
            if (tracked.size > 0 || settled) {
                return;
            }
            cancelTimer = setTimeout(() => finish(null), FOLLOW_GRACE_MS);
        };

        chrome.tabs.onUpdated.addListener(onUpdated);
        chrome.tabs.onCreated.addListener(onCreated);
        chrome.tabs.onRemoved.addListener(onRemoved);

        chrome.tabs.create({ url: createdUrl }).then((tab) => {
            if (settled) {
                return;
            }
            if (tab.id == null) {
                finish(null, new Error('Could not open the sign-in window'));
                return;
            }
            tracked.add(tab.id);
            ignore.delete(tab.id);
        }, (err) => finish(null, err));
    });
}

export async function openCenteredAuthWindow(url: string): Promise<URLSearchParams | null> {
    const redirectUri = chrome.identity.getRedirectURL();

    if (navigator.userAgent.includes('Firefox')) {
        return waitForFollowedTabRedirect(url, redirectUri);
    }

    const popup = await openAuthPopup(url);
    const tabId = popup.tabs?.[0]?.id;
    if (tabId == null) {
        throw new Error('Could not open the sign-in window');
    }

    return waitForPopupRedirect(popup, tabId, redirectUri);
}
