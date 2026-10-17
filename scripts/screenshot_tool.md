# Screenshot tool

Build the extension and run the sample configuration:

```sh
npm run build-dev
node scripts/screenshot.js
```

Install dependencies with `npm ci` and Chromium with `npx playwright install chromium` on a new machine. On Linux CI, use `npx playwright install --with-deps chromium`.

To use configuration and data from the website repository:

```sh
node scripts/screenshot.js --config ../calendar-website/screenshots/config.json --out ../calendar-website/public/screenshots
```

The config path and output directory are relative to the working directory. Data paths are relative to the config file. Without arguments, the tool uses this directory's `config.json` and writes to the extension repository's ignored `outScreenshots/` directory. Existing images with matching names are replaced; other images are retained.

Each screenshot can specify an `outputDir` to override `--out` or the default destination. Relative `outputDir` paths resolve from the config file's directory; absolute paths also work. Missing folders are created automatically, and existing files with the same name are overwritten. For example, in a website repo's `screenshots/config.json`:

```json
{
	"name": "calendar",
	"route": "/calendar.html",
	"outputDir": "../public/images/calendar",
	"actions": ["calendarReady"]
}
```

This writes `public/images/calendar/calendar.webp` in that website repository. Entries without `outputDir` keep using `--out` or the default destination.

Each screenshot uses a fresh temporary profile, mocked backend responses, and dark mode. No real account is needed. The browser closes after each capture. Screenshots run sequentially and stop on the first failure. Captures are converted in memory to lossless WebP using Sharp, preserving crisp text without writing intermediate PNG files.

## Configuration

`screenshots` is an array of entries with a unique `name` (the WebP filename without extension) and a `route`, such as `/calendar.html` or `/index.html`. Use the built extension's `.html` paths.

Optional shared settings are `data`, `date`, `timezone`, and `viewport`. Each screenshot can override `data`, `date`, and `viewport`. Set `signedIn: false` on a screenshot for the welcome page. Choose a fixed date inside the sample schedule's term.

Set `sidebar: true` on a screenshot to simulate sidebar detection (`chrome.tabs.getCurrent()` returns no tab), making the "Open in new tab" button visible. Use a narrow `viewport` to match sidebar dimensions. The capture still runs in an isolated browser tab.

`actions` runs in order before capture. `beforeEach` is an optional shared list that runs before each entry's actions. Use `waitFor` to specify what must be ready; the runner also waits for network idle and fonts before capturing.

## Extension settings

Add `settings` at the config's top level to apply to every screenshot, or inside a screenshot entry to override only that capture:

```json
{
	"settings": {
		"default_color_lecture": "#3f51b5",
		"default_color_lab": "#0b8043",
		"military_time": false,
		"advanced_editing": false
	},
	"screenshots": [
		{
			"name": "calendar-24-hour",
			"route": "/calendar.html",
			"settings": { "military_time": true },
			"actions": ["calendarReady"]
		}
	]
}
```

Settings merge in this order: built-in defaults, data-file settings, shared config settings, then screenshot settings. Other supported fields are `sync_university_events`, `university_event_categories`, `show_historic_terms`, and `enrolled_terms`. Enabling features may require additional mock responses.

An explicit `meeting_times[].calendar_config.color_id` in the sample data takes precedence over the default lecture/lab color. Remove that field from an event to show the configured default. A custom `responses["GET /api/user/extension_config"]` replaces the whole settings response, including these merged settings.

## Targets and quick actions

Define reusable targets under `targets` and reference them with `@name`. Define reusable action lists under `quickActions` and invoke them with a string in `actions`, or `{ "action": "use", "name": "openClassDetails" }`. Groups can invoke other groups.

```json
{
	"targets": {
		"classButton": {
			"role": "button",
			"name": "Object-Oriented Design",
			"exact": false,
			"index": 0
		},
		"dialog": { "role": "dialog", "name": "Edit Calendar Event" },
		"manualButton": { "role": "button", "name": "Manual", "within": "@dialog" }
	},
	"quickActions": {
		"openClassDetails": [
			{ "action": "click", "target": "@classButton" },
			{ "action": "waitFor", "target": "@dialog" }
		]
	},
	"screenshots": [
		{
			"name": "class-details",
			"route": "/calendar.html",
			"actions": ["openClassDetails"],
			"capture": { "target": "@dialog" }
		}
	]
}
```

Targets may be a CSS selector string, `{ "css": ".calendar" }`, `{ "role": "button", "name": "Settings" }`, `{ "label": "Course Title" }`, or `{ "text": "Your Calendar" }`. Object targets accept `within` to scope to another target and a zero-based `index` to select one of several matches. Text matching is exact unless `exact` is false. Prefer accessible roles and labels when possible.

## Actions

- `click`, `hover`: require `target`.
- `fill`: requires `target` and string `value`.
- `check`: requires `target`; optional `checked: false` unchecks.
- `select`: requires a select `target` and option `value`.
- `press`: requires `key`, such as `Escape`, `End`, or `PageDown`; optionally focus a `target` first.
- `waitFor`: requires `target`; optional `state` is `visible` (default), `hidden`, `attached`, or `detached`.
- `scroll`: with `target`, scrolls that element into view. Otherwise, scrolls the page to absolute `x`/`y` coordinates. For a scrollable modal or panel, target an element inside it, or press `PageDown` on the panel.
- `use`: invokes the quick action named by `name`.

Opening a modal uses an ordinary click on its trigger. Actions use Playwright's normal visibility and interaction waits; no arbitrary sleeps or JavaScript snippets are needed.

## Capturing

Omitting `capture` captures the current viewport, preserving the page's scroll position. Other choices:

```json
{ "capture": { "fullPage": true } }
```

```json
{ "capture": { "target": "@dialog" } }
```

```json
{ "capture": { "clip": { "x": 0, "y": 0, "width": 1280, "height": 240 } } }
```

Element captures automatically scroll the target into view. Clip coordinates describe a rectangle in the page; use viewport capture for a scrolled screen. Use only one capture mode at a time.

Add `padding` to a target capture to include surrounding content, like zooming out from that element:

```json
{ "capture": { "target": "@dialog", "padding": 32 } }
```

Use a number for equal padding on all sides, or an object for individual sides:

```json
{
	"capture": {
		"target": "@dialog",
		"padding": { "top": 24, "right": 32, "bottom": 48, "left": 32 }
	}
}
```

Padding is measured in CSS pixels and must be finite and non-negative. Omitted sides default to zero. The crop stops at the page edges and preserves the page's original scale; it does not resize the element or change browser zoom. Padding requires `target` and cannot be combined with `clip` or `fullPage`.

## Highlighting elements

Add `highlights` to a screenshot entry to draw red boxes around targets:

```json
{
	"name": "homepage",
	"route": "/index.html",
	"signedIn": false,
	"highlights": [
		{ "target": { "role": "button", "name": "Sign in with Google" } },
		{ "target": "@anotherTarget", "padding": 10, "shape": "rounded" }
	]
}
```

Each box uses a 3-pixel red outline with a default 6-pixel gap from the element. The default `shape` is `"box"`, with square corners. Use `"shape": "rounded"` to follow the element's rounded corners instead. Set `padding` to a finite, non-negative number of CSS pixels to change the gap. Highlights are applied after actions and capture scrolling, without changing the target's layout or shape. Leave room inside the capture for the outline; a tight element capture clips highlights outside its edges, so use capture padding when needed.

## Sample data

`calendar.json` contains the supplied sample classes, with blank lab instructor names replaced by empty lists to satisfy the extension's data validation. The tool derives term metadata and event preferences from it. Optional `settings` overrides extension settings, and `term` overrides the derived term.

For additional screens, a data file can contain `responses` keyed by method and API path. These replace default responses or add new ones:

```json
{
	"classes": [],
	"responses": {
		"GET /api/friends": { "friends": [] }
	}
}
```

Response keys match the pathname regardless of query parameters. Unknown requests are blocked and reported as missing mocks; actions never write to a real backend. The built-in responses cover calendar startup and class details. Other features may need extra responses. Fonts are loaded from Google Fonts when available, so consistent rendering requires the same browser, OS, and font availability.

The website repository can own copies of the config and data files; the tool does not depend on their location or the UI-test fixtures.
