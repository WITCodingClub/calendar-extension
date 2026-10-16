import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { submit } from 'publish-browser-extension';

process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'));

function required(name) {
	const value = process.env[name];
	if (!value?.trim()) throw new Error(`Missing ${name}.`);
	return value;
}

function validateVersions(paths, tag) {
	for (const path of paths) {
		const { version, packages } = JSON.parse(readFileSync(path, 'utf8'));
		if (`v${version}` !== tag) {
			throw new Error(`${path} version ${version} does not match ${tag}`);
		}
		if (packages && packages[''].version !== version) {
			throw new Error(`${path} root package version does not match ${version}`);
		}
	}
}

try {
	const command = process.argv[2];
	if (!['prepare', 'chrome', 'firefox'].includes(command)) {
		throw new Error('Usage: node scripts/release.js <prepare|chrome|firefox>');
	}
	const tag = required('VERSION');
	if (!/^v\d+\.\d+\.\d+$/.test(tag)) {
		throw new Error('VERSION must be a release tag such as v6.0.1');
	}
	const base = `wit-calendar-${tag}`;
	if (command === 'prepare') {
		validateVersions(['package.json', 'package-lock.json', 'static/manifest.json'], tag);
		console.log(`Building ${tag}`);
		execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
			stdio: 'inherit'
		});
		validateVersions(['extension/manifest.json', 'extension-firefox/manifest.json'], tag);
		for (const [directory, suffix] of [
			['extension', ''],
			['extension-firefox', '-firefox']
		]) {
			console.log(`Creating ${base}${suffix}.zip`);
			execFileSync('zip', ['-r', `../${base}${suffix}.zip`, '.'], {
				cwd: directory,
				stdio: 'inherit'
			});
		}
		console.log(`Creating ${base}-sources.zip`);
		execFileSync('git', ['archive', '--format=zip', `--output=${base}-sources.zip`, 'HEAD'], {
			stdio: 'inherit'
		});
	} else {
		const config =
			command === 'chrome'
				? {
						chrome: {
							apiVersion: 'v2',
							extensionId: 'aceelinogfcceklkpacakdeddnaakicj',
							publisherId: required('CHROME_PUBLISHER_ID'),
							serviceAccountClientEmail: required('CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL'),
							serviceAccountPrivateKey: required('CHROME_SERVICE_ACCOUNT_PRIVATE_KEY'),
							zip: `${base}.zip`
						}
					}
				: {
						firefox: {
							extensionId: 'wit-calendar@witcc.dev',
							channel: 'listed',
							jwtIssuer: required('FIREFOX_JWT_ISSUER'),
							jwtSecret: required('FIREFOX_JWT_SECRET'),
							zip: `${base}-firefox.zip`,
							sourcesZip: `${base}-sources.zip`
						}
					};
		console.log(`Submitting ${command} ${tag}`);
		const results = await submit(config);
		if (!results[command]?.success) {
			throw new Error(`${command} submission failed. Check the store output above.`);
		}
	}
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
}
