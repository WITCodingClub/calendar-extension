const SOURCE = 'wit-calendar';
const version = chrome.runtime.getManifest().version;
document.documentElement.dataset.witCalendarExtension = version;
function announce(type, returning) {
  if (typeof returning === 'boolean') {
    document.documentElement.dataset.witCalendarReturning = String(returning);
  }
  window.postMessage({ source: SOURCE, type, version, returning }, window.location.origin);
}
announce('hello');
chrome.storage.local.get('environment_data', ({ environment_data }) => {
  const returning = Object.values(environment_data?.jwt_tokens ?? {}).some(Boolean);
  announce('hello', returning);
});
window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.source !== window) return;
  if (event.data?.source !== SOURCE || event.data.type !== 'ping') return;
  chrome.storage.local.get('environment_data', ({ environment_data }) => {
    const returning = Object.values(environment_data?.jwt_tokens ?? {}).some(Boolean);
    announce('pong', returning);
  });
});
