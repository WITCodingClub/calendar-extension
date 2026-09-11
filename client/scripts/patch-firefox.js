import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const extDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension');
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
		strict_min_version: '128.0'
	}
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

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
