import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests/ui',
	testMatch: '**/*.spec.ts',
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: 0,
	timeout: 45_000,
	expect: { timeout: 8_000 },
	reporter: 'list',
	outputDir: 'test-results',
	use: { screenshot: 'off', video: 'off', trace: 'off' },
	projects: [
		{ name: 'deterministic', testIgnore: '**/live.spec.ts' },
		{ name: 'live', testMatch: '**/live.spec.ts' }
	]
});
