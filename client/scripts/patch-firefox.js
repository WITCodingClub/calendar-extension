import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const extDir = join(scriptDir, '..', 'extension');
if (!existsSync(extDir)) {
	console.error('No extension build found. Run npm run build-firefox first.');
	process.exit(1);
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

extractInlineScripts(extDir);
