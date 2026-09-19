const SOURCE = 'wit-calendar';
const version = chrome.runtime.getManifest().version;
document.documentElement.dataset.witCalendarExtension = version;
function isReturning(environment_data) {
  return Object.values(environment_data?.jwt_tokens ?? {}).some(Boolean);
}
function announce(type, returning) {
  if (typeof returning === 'boolean') {
    document.documentElement.dataset.witCalendarReturning = String(returning);
  }
  window.postMessage({ source: SOURCE, type, version, returning }, window.location.origin);
}
announce('hello');
chrome.storage.local.get('environment_data', ({ environment_data }) => {
  announce('hello', isReturning(environment_data));
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.environment_data) return;
  announce('hello', isReturning(changes.environment_data.newValue));
});
window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.source !== window) return;
  if (event.data?.source !== SOURCE || event.data.type !== 'ping') return;
  chrome.storage.local.get('environment_data', ({ environment_data }) => {
    announce('pong', isReturning(environment_data));
  });
});
