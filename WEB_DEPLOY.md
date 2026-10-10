# Deploying AmpliFood to the web

AmpliFood's web build is a static single-page app: one `index.html`, a JS bundle, a SQLite web worker, and hashed assets. There is no server code and nothing to keep secret. Each visitor's recipes, pantry, and AI key stay in their own browser.

**Recommended host: Vercel.** `vercel.json` in the repo root already holds the build command, output folder, SPA fallback, and cache headers.

## Go live on Vercel (first time)

1. Merge the rebrand PR into `main`.
2. Sign in at [vercel.com](https://vercel.com) with the GitHub account that owns this repo.
3. **Add New… → Project → Import** the `ianmkinney/food-dude` repository.
4. Set **Project Name** to `amplifood`, which gives you `amplifood.vercel.app` if the name is free. Leave the build settings as detected; Vercel reads them from `vercel.json`:
   - Framework preset: **Other**
   - Install command: `npm ci`
   - Build command: `npm run build:web`
   - Output directory: `dist`
5. Do **not** add any environment variables. AmpliFood is bring-your-own-key. Anything named `EXPO_PUBLIC_*` gets compiled into the public JS bundle, so never put an AI key there.
6. Click **Deploy**. When the build finishes, Vercel shows the production URL.
7. Optional: under **Settings → Domains**, add a custom domain (for example `amplifood.app`) and follow the DNS instructions Vercel shows.

After that, every push to `main` deploys to production, and every pull request gets its own preview URL.

### From the command line instead

```bash
npm i -g vercel
vercel login
vercel link          # once, in the repo root
vercel               # preview deploy (builds on Vercel's servers)
vercel --prod        # production deploy
```

Let Vercel run the build, which is the default. If you upload a folder you built locally (`vercel deploy dist` or `--prebuilt`), the CLI skips paths named `node_modules`. `npm run build:web` already renames those folders to `nm` for this reason, but building on Vercel avoids the question entirely.

## Build and check it locally first

```bash
npm ci
npm run build:web      # expo export --platform web + scripts/web-postexport.js
npm run preview:web    # serves dist/ with SPA fallback on http://localhost:8080
```

Open http://localhost:8080. Add a grocery item, reload the page, and it should still be there. Deep links such as `/pantry`, `/grocery`, and `/account` should open directly.

## Info pages: /about, /privacy, /terms, /support, /accessibility

These are static HTML files in `public/` (`about.html`, `privacy.html`, `terms.html`, `support.html`, `accessibility.html`, sharing `site.css` and `public/brand/`). They load without JavaScript, so app-store reviewers and crawlers can read them, and they don't wait for the app's database. `vercel.json` rewrites `/about`, `/privacy`, `/terms`, `/support` and `/accessibility` to those files before the app's catch-all. `/` stays the app. The contact email in `support.html` and `terms.html`, and the terms' effective date, are TODO placeholders until Ian adds the real address.

## What `vercel.json` does

| Setting | Why |
| --- | --- |
| `buildCommand: npm run build:web` | Exports the web bundle, then makes `dist/` host-agnostic (renames `assets/node_modules` to `assets/nm` and rewrites the URLs). |
| `rewrites` to `/index.html` (no `cleanUrls`: with it, Vercel only serves `index.html` at `/`, so the fallback 404s) | SPA fallback: refreshing `/pantry` or `/recipe/12` loads the app instead of a 404. `/_expo/*` and `/assets/*` are excluded, so a missing asset returns a real 404, not HTML. |
| `Cache-Control: immutable` on `/_expo/static` and `/assets` | Those filenames are content-hashed, so browsers can cache them forever. `index.html` stays uncached, so new deploys show up right away. |
| `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` | Basic hardening. Nothing in the app needs to be framed. |

No `Cross-Origin-Embedder-Policy` / `Cross-Origin-Opener-Policy` headers are sent, on purpose. See "SQLite" below.

## Why Vercel over EAS Hosting

Either can serve this app. Vercel fits better today:

- **Header and rewrite control in one file.** EAS Hosting applies custom response headers through the `expo-router` plugin config. This app uses React Navigation, not Expo Router, so on EAS Hosting you would have less control over caching and security headers.
- **Preview URL per pull request.** Vercel does this out of the box once the repo is connected. EAS Hosting deploys come from `eas deploy`, so you would add a CI job to get the same.
- **No account or plan coupling.** The static site has nothing to do with the EAS project used for native builds.

EAS Hosting is a reasonable choice if you'd rather keep everything under the Expo account: `npm run build:web && npx eas-cli deploy --prod` uploads `dist/`. Check Expo's hosting docs for how it handles SPA fallback for `output: "single"` before relying on deep links there. Netlify, Cloudflare Pages, and GitHub Pages also work, as long as you add an SPA fallback to `index.html`.

## What works on web, and what doesn't

| Feature | Web behaviour |
| --- | --- |
| Recipes, planner, pantry, grocery, party | Work. Data lives in SQLite (`expo-sqlite` on wa-sqlite) stored in the browser's Origin Private File System. It persists across reloads, per browser and per domain. |
| SQLite | Async API only, which is all the app uses. That path needs no `SharedArrayBuffer`, so no COOP/COEP headers. That matters because Safari and every iOS browser lack COEP `credentialless`, and `require-corp` would block cross-origin images. **Don't add `*Sync` SQLite calls**: they need cross-origin isolation, and the web build would break. |
| Opening a second tab | OPFS gives the database to one tab at a time. The second tab shows "AmpliFood is open in another tab" with a **Try again** button, instead of a raw error. |
| API keys | Stored in this browser's `localStorage` (via AsyncStorage). Not encrypted at rest, unlike Keychain/Keystore on phones. Clear with Account → Clear, or by clearing site data. |
| AI Chef / import / cost estimate | Calls go straight from the browser to the user's chosen provider. Anthropic needs the `anthropic-dangerous-direct-browser-access` header, which the app sends on web only. OpenAI, xAI, and Gemini allow browser CORS as-is. |
| Image import / recipe photos | Uses the browser file picker. Picked `blob:` images are re-encoded to data URIs before saving, so they survive a reload. |
| Barcode scanning | No camera scanner on web (`src/platform/camera.web.js`). Users type the barcode or the item name, and Open Food Facts lookup still works. |
| Share-to-AmpliFood (share sheet) | Native only (`src/platform/shareIntent.web.js` is a no-op). Paste a link or text into Import instead. |
| Haptics | Skipped on web. |
| Dialogs (`Alert.alert`) | React Native Web's `Alert` is a no-op, so `src/platform/alert.web.js` replaces it with an in-app themed dialog. |
| Clearing data | Browser settings → site data for the AmpliFood domain, or a private window. Each browser and domain has its own separate kitchen. |

## Troubleshooting

- **Icons are blank squares, or "AmpliFood could not start" mentions wasm.** The host isn't serving `dist/assets/nm/...`. Rebuild with `npm run build:web`, not plain `expo export`, and deploy the whole `dist/` folder.
- **Refreshing a page gives a 404.** The host has no SPA fallback. On Vercel it comes from `vercel.json`. Elsewhere, rewrite unknown paths to `/index.html`.
- **"AmpliFood is open in another tab".** Close the other tab, then press Try again.
- **AI says "Couldn't reach the provider".** The browser blocked the request. Check that an ad or privacy blocker isn't stopping `api.anthropic.com`, `api.openai.com`, `api.x.ai`, or `generativelanguage.googleapis.com`.

- **`/architecture`** is served from `public/architecture.html` (a copy of `docs/architecture.html`; keep them identical).
