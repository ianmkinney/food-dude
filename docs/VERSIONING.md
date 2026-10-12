# Versioning

- **Source of truth:** `package.json` `version` (synced into Expo via `app.config.js` and `npm run sync:version` for `app.json`).
- **Changelog:** edit `CHANGELOG.md`, then run `npm run prebuild:metadata` (or any web build) to refresh `src/generated/changelog.json` for in-app release notes.
- **Build metadata:** `npm run prebuild:metadata` writes `src/generated/buildMetadata.json` (git short SHA + ISO build time) before `build:web`.
- **New release:** `npm run release -- patch|minor|major|<x.y.z>` → update `CHANGELOG.md` → commit → `git tag -a vX.Y.Z -m "vX.Y.Z"` → push main and tags.
- **Backfill tags/releases:** `npm run release:history` (annotated tags + GitHub releases from `CHANGELOG.md`).
