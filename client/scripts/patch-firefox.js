import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const geckoId = 'wit-calendar@witcc.dev';
const firefoxRedirectUrl = `https://${createHash('sha1').update(geckoId).digest('hex')}.extensions.allizom.org/*`;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const extDir = join(scriptDir, '..', 'extension');
if (!existsSync(extDir)) {
	console.error('No extension build found. Run npm run build first.');
	process.exit(1);
}

const manifestPath = join(extDir, 'manifest.json');
const manifest = JSON.parse(
	readFileSync(manifestPath, 'utf8').replace(/,\s*([\]}])/g, '$1')
);
const icons = manifest.icons ?? { 128: 'icon128.png' };

delete manifest.side_panel;
manifest.permissions = (manifest.permissions ?? []).filter(
	(permission) => permission !== 'sidePanel' && permission !== 'identity.email'
);
for (const permission of ['cookies', 'contextualIdentities']) {
	if (!manifest.permissions.includes(permission)) {
		manifest.permissions.push(permission);
	}
}
const hostPermissions = manifest.host_permissions ?? [];
if (!hostPermissions.includes(firefoxRedirectUrl)) {
	hostPermissions.push(firefoxRedirectUrl);
}
manifest.host_permissions = hostPermissions;
manifest.sidebar_action = {
	default_title: manifest.name,
	default_panel: 'index.html',
	default_icon: icons
};
manifest.action = {
	default_title: manifest.name,
	default_icon: icons
};
manifest.background = { scripts: ['service-worker.js'] };
manifest.browser_specific_settings = {
	gecko: {
		id: geckoId,
		strict_min_version: '140.0',
		data_collection_permissions: {
			required: ['personallyIdentifyingInfo', 'authenticationInfo', 'websiteContent']
		}
	},
	gecko_android: {
		strict_min_version: '142.0'
	}
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const squareIcon = join(scriptDir, 'icon128-square.png');
if (!existsSync(squareIcon)) {
	console.error('Missing client/scripts/icon128-square.png');
	process.exit(1);
}
copyFileSync(squareIcon, join(extDir, 'icon128.png'));

function extractInlineScripts(dir) {
	const scriptsDir = join(dir, 'scripts');
	for (const file of readdirSync(dir).filter((name) => name.endsWith('.html'))) {
		const htmlPath = join(dir, file);
		let html = readFileSync(htmlPath, 'utf8');
		html = html
			.replace(/scripts\/immutable\/bundle\.[A-Za-z0-9_-]+\.js/g, 'scripts/immutable/bundle.js')
			.replace(
				/scripts\/immutable\/assets\/bundle\.[A-Za-z0-9_-]+\.css/g,
				'scripts/immutable/assets/style.css'
			);

		let scriptIndex = 0;
		html = html.replace(
			/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi,
			(match, _attrs, body) => {
				const source = body.trim();
				if (!source) return match;

				const js = source
					.replace(/\b(__sveltekit_\w+)\s*=/, 'globalThis.$1 =')
					.replace(
						/document\.currentScript\.parentElement/,
						'document.body.querySelector(\'div[style*="display: contents"]\')'
					)
					.replace(
						/import\("\.\/(?:\.\/)?scripts\/immutable\/bundle(?:\.[^"]+)?\.js"\)/g,
						'import("./immutable/bundle.js")'
					);

				const stem = file.replace(/\.html$/, '');
				const outName =
					scriptIndex === 0 ? `start-${stem}.js` : `start-${stem}-${scriptIndex}.js`;
				scriptIndex += 1;
				writeFileSync(join(scriptsDir, outName), `${js}\n`);
				return `<script src="./scripts/${outName}" type="module"></script>`;
			}
		);

		writeFileSync(htmlPath, html);
	}
}

const firefoxAuthShim = `(function () {
	function patch(api) {
		if (!api || !api.windows || !api.windows.create || api.windows.create.__ffAuth) return;
		const originalCreate = api.windows.create.bind(api.windows);
		const origOnUpdatedAdd = api.tabs.onUpdated.addListener.bind(api.tabs.onUpdated);
		const origOnUpdatedRemove = api.tabs.onUpdated.removeListener.bind(api.tabs.onUpdated);
		const origOnRemovedAdd = api.windows.onRemoved.addListener.bind(api.windows.onRemoved);
		const origOnRemovedRemove = api.windows.onRemoved.removeListener.bind(api.windows.onRemoved);
		const updatedMap = new WeakMap();
		const removedMap = new WeakMap();
		let tracked = null;

		function redirectPrefix() {
			try {
				return api.identity.getRedirectURL().replace(/\\/$/, '');
			} catch {
				return '';
			}
		}

		function isRedirect(href) {
			const prefix = redirectPrefix();
			if (!href || !prefix) return false;
			return href === prefix || href.startsWith(prefix + '/') || href.startsWith(prefix + '?');
		}

		function isFollowTab(href, createdUrl) {
			if (!href) return false;
			if (isRedirect(href)) return true;
			if (href.indexOf('confirm-page.html') === -1) return false;
			try {
				return href.indexOf(encodeURIComponent(new URL(createdUrl).hostname)) !== -1;
			} catch {
				return true;
			}
		}

		function hostsMatch(href, createdUrl) {
			try {
				return new URL(href).hostname === new URL(createdUrl).hostname;
			} catch {
				return false;
			}
		}

		origOnUpdatedAdd(function (tabId, info, tab) {
			if (!tracked || tracked.ignore.has(tabId)) return;
			const href = (info && info.url) || tab.url || '';
			if (isFollowTab(href, tracked.url) || isRedirect(href) || hostsMatch(href, tracked.url)) {
				tracked.tabIds.add(tabId);
			}
		});

		api.tabs.onCreated.addListener(function (tab) {
			if (!tracked || tab.id == null) return;
			const href = tab.pendingUrl || tab.url || '';
			if (
				!href ||
				href === 'about:blank' ||
				isFollowTab(href, tracked.url) ||
				hostsMatch(href, tracked.url) ||
				isRedirect(href)
			) {
				tracked.tabIds.add(tab.id);
			}
		});

		function create(createData, callback) {
			if (typeof createData === 'function') {
				callback = createData;
				createData = {};
			}
			const data = Object.assign({}, createData || {});
			const result = Promise.resolve(originalCreate(data)).then(function (win) {
				const href = Array.isArray(data.url) ? data.url[0] : data.url;
				if (data.type === 'popup' && typeof href === 'string') {
					const tabId = win && win.tabs && win.tabs[0] && win.tabs[0].id;
					tracked = {
						windowId: win && win.id,
						tabId: tabId,
						url: href,
						tabIds: new Set(tabId != null ? [tabId] : []),
						ignore: new Set()
					};
					api.tabs.query({}).then(function (tabs) {
						if (!tracked) return;
						tabs.forEach(function (tab) {
							if (tab.id != null && tab.id !== tabId) tracked.ignore.add(tab.id);
						});
					});
				}
				return win;
			});
			if (typeof callback === 'function') {
				result.then(callback, function () {
					callback();
				});
				return;
			}
			return result;
		}
		create.__ffAuth = true;

		function redefine(obj, key, value) {
			try {
				obj[key] = value;
			} catch {
				Object.defineProperty(obj, key, { value: value, configurable: true, writable: true });
			}
		}

		redefine(api.windows, 'create', create);

		redefine(api.tabs.onUpdated, 'addListener', function (listener) {
			const wrapped = function (tabId, info, tab) {
				listener(tabId, info, tab);
				if (!tracked || tab.id === tracked.tabId) return;
				const href = (info && info.url) || tab.url;
				if (!isRedirect(href)) return;
				listener(
					tracked.tabId,
					{ url: href, status: 'complete' },
					Object.assign({}, tab, { id: tracked.tabId, url: href })
				);
				tracked = null;
				if (tab.id != null) api.tabs.remove(tab.id).catch(function () {});
			};
			updatedMap.set(listener, wrapped);
			return origOnUpdatedAdd(wrapped);
		});
		redefine(api.tabs.onUpdated, 'removeListener', function (listener) {
			const wrapped = updatedMap.get(listener) || listener;
			updatedMap.delete(listener);
			return origOnUpdatedRemove(wrapped);
		});

		redefine(api.windows.onRemoved, 'addListener', function (listener) {
			const wrapped = function (windowId) {
				if (!tracked || windowId !== tracked.windowId) {
					listener(windowId);
					return;
				}
				const createdUrl = tracked.url;
				const tabIds = tracked.tabIds;
				const ignore = tracked.ignore;
				let iv;
				const check = function () {
					if (!tracked || tracked.windowId !== windowId) {
						clearInterval(iv);
						return;
					}
					api.tabs.query({}).then(function (tabs) {
						if (!tracked || tracked.windowId !== windowId) {
							clearInterval(iv);
							return;
						}
						const still = tabs.some(function (tab) {
							if (tabIds.has(tab.id)) return true;
							if (ignore.has(tab.id)) return false;
							const href = tab.url || '';
							return isFollowTab(href, createdUrl) || hostsMatch(href, createdUrl);
						});
						if (still) return;
						clearInterval(iv);
						tracked = null;
						listener(windowId);
					});
				};
				iv = setInterval(check, 400);
				setTimeout(check, 400);
			};
			removedMap.set(listener, wrapped);
			return origOnRemovedAdd(wrapped);
		});
		redefine(api.windows.onRemoved, 'removeListener', function (listener) {
			const wrapped = removedMap.get(listener) || listener;
			removedMap.delete(listener);
			return origOnRemovedRemove(wrapped);
		});
	}

	if (typeof chrome !== 'undefined') patch(chrome);
	if (typeof browser !== 'undefined' && browser !== chrome) patch(browser);
})();
`;

function injectFirefoxAuthShim(dir) {
	const scriptsDir = join(dir, 'scripts');
	writeFileSync(join(scriptsDir, 'ff-auth-window.js'), firefoxAuthShim);
	for (const file of readdirSync(dir).filter((name) => name.endsWith('.html'))) {
		const htmlPath = join(dir, file);
		let html = readFileSync(htmlPath, 'utf8');
		if (html.includes('ff-auth-window.js')) continue;
		if (/<head[^>]*>/i.test(html)) {
			html = html.replace(/<head([^>]*)>/i, '<head$1><script src="./scripts/ff-auth-window.js"></script>');
		} else if (/<html[^>]*>/i.test(html)) {
			html = html.replace(/<html([^>]*)>/i, '<html$1><script src="./scripts/ff-auth-window.js"></script>');
		} else {
			html = `<script src="./scripts/ff-auth-window.js"></script>${html}`;
		}
		writeFileSync(htmlPath, html);
	}
}

function patchBundledJs(dir) {
	const immutableDir = join(dir, 'scripts', 'immutable');
	if (!existsSync(immutableDir)) return;

	for (const file of readdirSync(immutableDir).filter((name) => name.endsWith('.js'))) {
		const filePath = join(immutableDir, file);
		const source = readFileSync(filePath, 'utf8')
			.replace(/\.innerHTML\s*=/g, '["innerHTML"] =')
			.replace(/chrome\.identity\.getProfileUserInfo\s*\([^)]*\)/g, 'Promise.resolve({})');
		writeFileSync(filePath, source);
	}
}

extractInlineScripts(extDir);
injectFirefoxAuthShim(extDir);
patchBundledJs(extDir);

const swPath = join(extDir, 'service-worker.js');
if (existsSync(swPath)) {
	writeFileSync(
		swPath,
		readFileSync(swPath, 'utf8').replace(
			/chrome\.sidePanel[\s\S]*?\.catch\(\s*\(error\)\s*=>\s*console\.error\(error\)\s*\);/,
			`browser.action.onClicked.addListener(() => {
  browser.sidebarAction.toggle();
});`
		)
	);
}
