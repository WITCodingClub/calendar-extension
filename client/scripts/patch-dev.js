import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionKey =
	'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA6Cg2AJDwx3cRiK93ve0oRDcA527FQJEhRWNkxdASTtpMKC4n/lE79mfT+XmIvKOGmCR+dE5dnoHuPugAqgZMPWdRlS4sC9VN1oT0pCnoMGU7GLveDquL6ROFE4Mh7dI2qsjICoJ+VsYEbx74ybmDOpM7FqfD2H7qMU1PP4Gle0GDuZkDI1jeYWXJc8KDIBgn/QDLIqlE0mCpzO7eVXJdq5mosWVWMZE7OTBK4R5jWN6EtL/ReF4slaDJiGeJT0q7sFFjG4IOjcCr4ixPZ4dHm7uEDt+mZ7LgQ4mL+LhibGFOborRtEsavNxr/10rYqVFMUIbSO0jEvmyHY6QEWFrXQIDAQAB';

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

const patched = {};
for (const [key, value] of Object.entries(manifest)) {
	if (key === 'key') continue;
	patched[key] = value;
	if (key === 'description') {
		patched.key = extensionKey;
	}
}

if (!('key' in patched)) {
	patched.key = extensionKey;
}

writeFileSync(manifestPath, `${JSON.stringify(patched, null, 2)}\n`);
