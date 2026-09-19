const SOURCE = 'wit-calendar';
const version = chrome.runtime.getManifest().version;
document.documentElement.dataset.witCalendarExtension = version;
function announce(type) {
  window.postMessage({ source: SOURCE, type, version }, window.location.origin);
}
announce('hello');
window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.source !== window) return;
  if (event.data?.source !== SOURCE || event.data.type !== 'ping') return;
  announce('pong');
});
