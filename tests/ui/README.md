# Testing the extension

These tests open the built extension and use it as a person would: selecting friends, opening dialogs, checking forms, and navigating between views. They run without showing a browser window by default.

For normal development, the tests use made-up accounts and schedules. You do not need to sign in or connect to the real backend. Each test gets a temporary browser profile that is deleted afterward.

## First-time setup

Run commands from the repository's root folder, where `package.json` is located.

The `npm` and `npx` commands below work in PowerShell on Windows and Bash on Linux/macOS. Where setting an environment variable needs different syntax, expand the example for your shell.

1. Install Node.js 24 if needed. Check your installed version with `node --version`.
2. Install the project's packages:

   ```sh
   npm ci
   ```

3. Install the browser used by the tests:

   ```sh
   npx playwright install chromium
   ```

   <details>
   <summary>Linux: install browser system dependencies</summary>

   On Linux, use this command instead of the one above:

   ```sh
   npx playwright install --with-deps chromium
   ```

   Windows and macOS use the regular installation command above.

   </details>

4. Check the test code, then run the UI tests:

   ```sh
   npm run test:ui:check
   npm run test:ui
   ```

`test:ui` builds the extension before running the tests. It tests the files in `extension/`, rather than the development website. Run one build at a time because they share the same output folder.

After setup, `npm run test:ui` is the usual command to run after a UI change.

## Useful commands

| Command                                    | What it does                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| `npm run test:ui`                          | Builds the extension and runs all seven normal UI tests.               |
| `npm run test:ui:check`                    | Checks the UI test code for TypeScript errors.                         |
| `npm run test:ui:built -- friends.spec.ts` | Runs one test file using the extension you already built.              |
| `npm test`                                 | Runs the existing unit tests. These are separate from the UI tests.    |
| `npm run check`                            | Checks the application's Svelte and TypeScript code.                   |
| `npm run test:ui:live`                     | Runs the optional staging checks. Complete the live setup below first. |

## What the tests cover

| Area                                                    | What is checked                                                                                                                                                                              |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Calendar](calendar.spec.ts)                            | Open two different event dialogs and close each one. Report the time to open each dialog separately from the time spent on backend requests.                                                 |
| [Friends planner](friends.spec.ts)                      | Search for and select friends, change planning preferences, reject invalid inputs, reload schedules, and expand results.                                                                     |
| [Meeting draft](friends.spec.ts)                        | Choose and adjust a time, use the slider, enter draft details, preview the meeting, and reopen it for editing. Creation and link controls stay disabled while those features are unfinished. |
| [Calendar comparison](friends.spec.ts)                  | Check the selected people's schedules, combined busy periods, detail dialogs, week navigation, and exit controls.                                                                            |
| [Settings and management](settings-management.spec.ts)  | Scroll through Settings without changing its values. Navigate People, Groups, and Requests, and exercise forms without submitting relationship changes.                                      |
| [Sign-in guards and network protection](guards.spec.ts) | Check signed-out pages and local reset. Verify that requests from the extension page and background worker are intercepted, and that attempted production requests are blocked.              |

The tests also check that pages, dialogs, and drawers fit at widths of **320, 480, and 1280 pixels**. The Calendar grid is allowed to scroll horizontally.

These checks catch behavior and layout problems, but they do not compare screenshots. Real sign-in, university imports, calendar syncing, Firefox, the browser's native side panel, and saving changes to real accounts need separate testing. Existing saved groups are also outside coverage; the management tests exercise unsaved group forms.

## When a test fails

1. Read the failed test's name, expected result, and file/line number in the terminal or GitHub log.
2. If you changed application code, build it again before running just the failed file:

   ```sh
   npm run build-dev
   npm run test:ui:built -- friends.spec.ts
   ```

   Replace `friends.spec.ts` with the file that failed. To narrow it down further, add a name filter:

   ```sh
   npm run test:ui:built -- friends.spec.ts --grep "comparison"
   ```

3. Decide whether the failure reveals a bug or whether the intended behavior has changed. Update the application or the test accordingly; do not remove a useful check just to make it pass.
4. Run the full suite with `npm run test:ui` after fixing it.

To watch the browser, use the example for your shell:

<details>
<summary>PowerShell (Windows)</summary>

```powershell
$env:WIT_UI_HEADED = '1'
try {
    npm run test:ui:built -- friends.spec.ts
} finally {
    Remove-Item Env:WIT_UI_HEADED -ErrorAction SilentlyContinue
}
```

</details>

<details>
<summary>Bash</summary>

```bash
WIT_UI_HEADED=1 npm run test:ui:built -- friends.spec.ts
```

</details>

To pause and step through the test with Playwright Inspector:

<details>
<summary>PowerShell (Windows)</summary>

```powershell
$env:PWDEBUG = '1'
try {
    npm run test:ui:built -- friends.spec.ts
} finally {
    Remove-Item Env:PWDEBUG -ErrorAction SilentlyContinue
}
```

</details>

<details>
<summary>Bash</summary>

```bash
PWDEBUG=1 npm run test:ui:built -- friends.spec.ts
```

</details>

These options apply to the example run only. PowerShell clears the setting in `finally`; Bash sets it just for that command.

Calendar tests also print dialog-opening and request timings. These are samples from the test environment, not speed targets or measurements of the real server.

### Screenshots and traces

Normal runs do not capture screenshots, recordings, or network archives. Text describing a failure may appear in the ignored `test-results/` folder and is replaced on the next run.

If a specific normal-test failure needs a screenshot or trace:

1. Record what you need to investigate.
2. Temporarily add `page.screenshot(...)` at the failing step, or `context.tracing.start(...)` / `stop(...)` in [the shared fixture](extension.fixture.ts). The usual `--trace` option does not record this fixture's browser context.
3. Save the output under `test-results/`. Check it for credentials, private URLs, IDs, and other account data before sharing.
4. Remove the temporary capture code and delete the files when the issue is resolved, or within seven days, whichever comes first.

Do not capture personal-account or live-session data.

## Keeping the tests up to date

### When you change a UI feature

1. Find the relevant test file in the coverage table above.
2. Add or update checks for the intended behavior, including invalid inputs where relevant. Use visible button text and input labels. Let Playwright wait for the expected state instead of adding fixed delays or changing application state behind the UI.
3. Build and run that file while working, then run `npm run test:ui:check` and `npm run test:ui` before finishing. Run `npm test` and `npm run check` when the application code changes.

When meeting creation or link generation is implemented, replace the corresponding disabled-control checks with tests of the new behavior. Keep normal tests on made-up backend responses. Before testing real writes in staging, arrange appropriate test accounts and protection against external side effects.

### When backend requests or responses change

1. Confirm the actual backend behavior from its current source.
2. Update the made-up responses in [backend.ts](backend.ts) to match it.
3. If the extension needs a new request, update the permitted methods and paths in [extension.fixture.ts](extension.fixture.ts). Only permit verified, necessary requests. Keep the network-protection tests in place.
4. Run the test-code check and full UI suite again.

Normal tests use October 6, 2026 at noon in `America/New_York`. This fixed date keeps results repeatable; it does not need to advance with today's date. If you change it, update the term dates, schedule dates, and account term settings together in `backend.ts`.

### When you upgrade Playwright or Node.js

1. For a Playwright upgrade, change the exact `@playwright/test` version in `package.json`, then run `npm install`. Include the resulting `package-lock.json` changes.
2. Run `npx playwright install chromium` to install the matching browser. Use the Linux command from setup if needed.
3. Run `npm run test:ui:check` and `npm run test:ui` to verify the upgrade.
4. If you change the required Node.js version, update both this guide and the UI workflow's `node-version` so local runs and CI stay aligned.

Reports and optional agent guidance stay under ignored `.agents/`. The tests do not depend on those files or on machine-specific tooling.

## Accounts and network protection

Normal tests use the real browser and Chrome extension APIs, with fake sign-in data and controlled backend replies. This proves the extension's UI behavior, not that real authentication or the backend works. The test browser uses system fonts because the Google Fonts stylesheet is replaced with an empty response.

Unexpected requests fail the tests. A local blocking proxy also catches traffic that bypasses Playwright's request handling. The suite checks both the extension page and background worker; it also tests the blocking proxy directly. Known browser background connections, including Chromium's spellcheck dictionary downloads to `redirector.gvt1.com`, are blocked separately without failing the suite. Extension page and worker fetches to those hosts still fail the strict request guard. These are protections within the test browser, not a system-wide firewall.

**Leave** `.verification/profiles/wit-calendar` **untouched.** It contains a personal login. Never copy its credentials, upload it, reset it, or use its account for automated changes. The shared fixture creates its own temporary profiles and cannot select that profile.

## Optional: testing against staging

Most development work only needs the normal tests. Live mode checks Calendar, accepted friends, and the account shown in Settings against the real staging backend. It does not test the Google/passkey sign-in process or set up test accounts. It still uses the system-font fallback described above.

### Arrange the staging setup first

Ask the staging operator to:

1. Provide a dedicated primary test account and at least three accepted test friends. Their current-term schedules must be valid and include predictable busy and free periods. Incoming/outgoing request fixtures need separate made-up senders.
2. Confirm the deployed API version, extension redirect ID, and any access restrictions. Issue a real, revocable session token with a session ID (`jti`) and more than one minute but no more than one hour remaining. Do not use a personal token or production signing key.
3. Prevent real emails, invitations, Google/Microsoft calendar writes, university scraping, 25Live refresh, and telemetry for these accounts. This must also cover queued backend jobs.
4. Arrange cleanup of only the run's accounts, data, and jobs, including token revocation and cleanup after canceled runs. Run one job at a time until the backend supports separate accounts and repeatable setup/cleanup for concurrent runs.

Live schedules must cover the actual current term and dates in `America/New_York`; do not copy the fixed normal-test dates after their term expires. Live tests allow only the known staging read requests, although those reads may update the session's last-used time.

### Run the live checks

The test reads these environment variables:

| Variable                  | What to supply                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WIT_LIVE_ACCOUNT_SCOPE`  | The value `isolated-staging`, confirming you arranged the dedicated staging setup. This is an acknowledgement, not a permission enforced by the server. |
| `WIT_LIVE_EXPECTED_EMAIL` | The primary test account's email address.                                                                                                               |
| `WIT_LIVE_JWT`            | The short-lived staging session token. Treat it as a secret.                                                                                            |

Choose your shell below and replace `REPLACE_WITH_TEST_EMAIL` with the supplied test-account email. Both examples prompt for the token without showing what you type and clear the environment variables afterward.

<details>
<summary>PowerShell (Windows)</summary>

```powershell
$env:WIT_LIVE_ACCOUNT_SCOPE = 'isolated-staging'
$env:WIT_LIVE_EXPECTED_EMAIL = 'REPLACE_WITH_TEST_EMAIL'
$env:WIT_LIVE_JWT = [System.Net.NetworkCredential]::new('', (Read-Host 'Staging token' -AsSecureString)).Password
try {
    npm run test:ui:live
} finally {
    Remove-Item Env:WIT_LIVE_JWT, Env:WIT_LIVE_EXPECTED_EMAIL, Env:WIT_LIVE_ACCOUNT_SCOPE -ErrorAction SilentlyContinue
}
```

</details>

<details>
<summary>Bash</summary>

```bash
(
    export WIT_LIVE_ACCOUNT_SCOPE='isolated-staging'
    export WIT_LIVE_EXPECTED_EMAIL='REPLACE_WITH_TEST_EMAIL'
    read -r -s -p 'Staging token: ' WIT_LIVE_JWT || exit 1
    printf '\n'
    export WIT_LIVE_JWT
    npm run test:ui:live
)
```

The parentheses keep these variables in a temporary shell, so they are discarded when the run ends.

</details>

Afterward, have the operator revoke the session and perform the agreed cleanup. Clearing the environment variables does not revoke the token.

Automating live tests in CI still requires backend support for securely issuing restricted staging sessions, preparing/resetting each run's data, and preventing external side effects. This frontend suite does not provide those facilities, and no live CI workflow is configured.
