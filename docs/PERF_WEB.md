# Web performance notes (Oct 2026)

Measured on this repo with `npm run build:web` in the Cloud Agent environment (Expo export, production minify). Runtime tab-switch timings need a browser with the deployed build; numbers below are build artifacts as a proxy for first-load JS.

## Before (main, pre–lazy-load)

| Metric | Value |
| --- | --- |
| Export build time | ~18 s |
| `dist/` total | 8.7 MB |
| Primary entry chunk | ~2.6 MB (`index-*.js`) |

## After (`cursor/web-perf-desktop-84d7`)

| Metric | Value |
| --- | --- |
| Export build time | ~6 s |
| `dist/` total | 8.7 MB (similar; lazy chunks split out) |
| Primary entry chunk | ~2.3 MB (`index-52e33….js`, down from ~2.6 MB) |
| Lazy route chunks | e.g. `MealPlannerScreen` ~15 KB, `AiChefScreen` ~26 KB (loaded on first tab visit) |

Changes:

- Tab and stack screens load via `React.lazy` + `Suspense`, so heavy screens are not parsed on first load.
- Meal planner SQLite reads run after `InteractionManager.runAfterInteractions` to avoid blocking the first paint.
- Recipe list uses memoized `renderItem` and tighter FlatList windowing.
- `@zxing/library` remains dynamically imported in `camera.web.js`.

## Desktop layout

`WebShell` caps content at **480px** width on web, centered, with tab bar and FAB inside the column.
