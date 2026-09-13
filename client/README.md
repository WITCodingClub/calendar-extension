# WIT-Calendar (client)

## Setup
1. Install [npm/node.js](https://nodejs.org/en/download)
3. Run ``npm i`` in this directory (``/client``)
4. Run ``npm run build-dev`` to build the extension. Built files will be in ``/client/extension/``
5. optional: if you're on firefox, run ``npm run build-firefox`` instead.

``npm run build`` is the release build and leaves out the manifest ``key``, so
Chrome gives the unpacked copy a random extension ID. Google sign-in is tied to
one ID — the published one — so a plain build fails at sign-in with
``redirect_uri_mismatch``. ``build-dev`` puts the key back and gives you the same
ID as the Web Store copy.

## Testing the Extension (for chrome)

1. Head to ``chrome://extensions``
2. Enable Developer Mode
3. Click ``Load Unpacked``
4. Select the folder (extension)
5. Ensure the added Extension is enabled
6. Simply click on the extension icon to use it.
