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