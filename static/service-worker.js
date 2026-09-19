function isTutorialSiteTab(tab) {
  const url = tab.url ?? '';
  try {
    const { protocol, hostname } = new URL(url);
    if (hostname.endsWith('.witcc.dev') && protocol === 'https:') return true;
    if (hostname === 'localhost' && protocol === 'http:') return true;
    return false;
  } catch {
    return false;
  }
}

function isWitCalendarStoreTab(tab) {
  const url = tab.url ?? '';
  try {
    const { hostname, pathname } = new URL(url);
    if (hostname === 'addons.mozilla.org' || hostname.endsWith('.addons.mozilla.org')) {
      return pathname.includes('/addon/wit-calendar');
    }
    const onChromeStore = hostname === 'chromewebstore.google.com' || hostname === 'chrome.google.com';
    return onChromeStore && (pathname.includes('aceelinogfcceklkpacakdeddnaakicj') || pathname.includes('wit-calendar'));
  } catch {
    return false;
  }
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') return;

  try {
    const tabs = await chrome.tabs.query({});
    const siteTabs = tabs.filter(isTutorialSiteTab);
    if (!siteTabs.length) return;

    await Promise.all(
      siteTabs.map(async (tab) => {
        if (tab.id == null) return;
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['scripts/site.js']
          });
        } catch (error) {
          console.error('Error injecting site script:', error);
        }
      })
    );

    const storeTabs = tabs.filter(isWitCalendarStoreTab);
    await Promise.all(storeTabs.map((tab) => (tab.id != null ? chrome.tabs.remove(tab.id) : undefined)));

    const siteTab = siteTabs.find((tab) => tab.active) ?? siteTabs[0];
    if (siteTab?.id != null) {
      if (siteTab.windowId != null) {
        await chrome.windows.update(siteTab.windowId, { focused: true });
      }
      await chrome.tabs.update(siteTab.id, { active: true });
    }
  } catch (error) {
    console.error('Error returning to install tutorial:', error);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Check if the URL matches any environment's OAuth success page
    const oauthSuccessPatterns = [
      'https://heron-selected-literally.ngrok-free.app/oauth/success',
      'https://staging-calendar.witcc.dev/oauth/success',
      'https://calendar.witcc.dev/oauth/success'
    ];

    const isOAuthSuccess = oauthSuccessPatterns.some(pattern => tab.url.includes(pattern));

    if (isOAuthSuccess) {
      console.log('OAuth success page detected');

      try {
        await chrome.storage.local.set({
          oauth_status: 'success',
        });
        chrome.tabs.remove(tabId);
      } catch (error) {
        console.error('Error during authentication:', error);
      }
    }
  }
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));