const POPUP_WIDTH = 480;
const POPUP_HEIGHT = 720;

function isRedirect(href: string | undefined, redirectUri: string): boolean {
    if (!href) {
        return false;
    }
    const prefix = redirectUri.replace(/\/$/, '');
    return href === prefix || href.startsWith(`${prefix}/`) || href.startsWith(`${prefix}?`);
}

export async function openCenteredAuthWindow(url: string): Promise<URLSearchParams | null> {
    const redirectUri = chrome.identity.getRedirectURL();
    const screenWidth = window.screen.availWidth;
    const screenHeight = window.screen.availHeight;
    const width = Math.min(POPUP_WIDTH, screenWidth);
    const height = Math.min(POPUP_HEIGHT, screenHeight);

    let popup: chrome.windows.Window;
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

    const tabId = popup.tabs?.[0]?.id;
    if (tabId == null) {
        throw new Error('Could not open the sign-in window');
    }

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

        const onUpdated = (_id: number, info: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
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
