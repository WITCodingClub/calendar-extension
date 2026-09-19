<p align="center">
    <img src="resources/W-Calendar-outlined-back-only.png" width="128" alt="WIT-calendar Icon"/>
</p>

<h3 align="center">
    <strong>WIT-Calendar</strong>
</h3>

<p align="center">
    <a href="https://calendar.witcc.dev">website</a> · <a href="https://chromewebstore.google.com/detail/wit-calendar/aceelinogfcceklkpacakdeddnaakicj">install</a> · <a href="https://stats.uptimerobot.com/QS76oPqfzz">status page</a>
    <br>
    (middle-click or ctrl/cmd+click to open in a new tab)
</p>

## Description
WIT-Calendar is a Chrome extension that makes adding your classes to your calendar easy & quick!
It supports all major calendars, including Google Calendar, Microsoft Outlook, and Apple Calendar.
In the future, you will also be able to find "best times" to meet with fellow students, easily register for classes, and more!

## How does it work?
The Chrome extension gets your schedule, processes it, and then provides you with a calendar link. You can also optionally connect your Google account for automatic updates to your Google Calendar.

You can also manage event alerts, colors, and titles from within the extension.

## Development
1. Install [npm/node.js](https://nodejs.org/en/download)
2. Run ``npm i``
3. Run ``npm run build-dev`` to build the extension. Built files will be in ``extension/``
4. optional: if you're on firefox, run ``npm run build-firefox`` instead.

``npm run build`` is the release build and leaves out the manifest ``key``, so
Chrome gives the unpacked copy a random extension ID. Google sign-in is tied to
one ID — the published one — so a plain build fails at sign-in with
``redirect_uri_mismatch``. ``build-dev`` puts the key back and gives you the same
ID as the Web Store copy.

### Testing the Extension (for chrome)

1. Head to ``chrome://extensions``
2. Enable Developer Mode
3. Click ``Load Unpacked``
4. Select the folder (extension)
5. Ensure the added Extension is enabled
6. Simply click on the extension icon to use it.

### Testing the Extension (for firefox)

1. Head to ``about:debugging#/runtime/this-firefox``
2. Hit Load Temporary Add-on
3. Select the manifest.json from the built extension
4. Simply click on the extension icon to use it.

- See instructions for developing the backend [here](https://github.com/WITCodingClub/calendar-backend/blob/main/README.md).
