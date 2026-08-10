# NCTD Train Tracker

A mobile-first PWA for NCTD COASTER and SPRINTER routes. It can be installed from Chrome on Android and opens like an app.

## GitHub Pages

1. Push this repository and enable **Settings → Pages → Deploy from a branch → main / root**.
2. In `config.js`, set `apiBaseUrl` to the HTTPS URL of your deployed proxy. Do not put the Swiftly key in this repository or in `config.js`.
3. Open the GitHub Pages URL on Android Chrome. Select **⋮ → Install app** (or **Add to Home screen**).

GitHub Pages hosts only the PWA. It cannot run `server.js`; deploy that file to an HTTPS Node host (such as Render, Railway, or Fly.io), set `SWIFTLY_API_KEY` and `ALLOWED_ORIGIN=https://karnatyrohit.github.io` as host secrets/environment variables before using it publicly.

## Local use

```powershell
cd train-tracker
node server.js
```

Then open `http://localhost:3000`.

