import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
		id: 'wit-calendar@witcc.dev',
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

extractInlineScripts(extDir);
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
