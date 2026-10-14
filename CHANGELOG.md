# Changelog

All notable user-facing changes to AmpliFood are documented here. Versions follow [Semantic Versioning](https://semver.org/).

## [1.0.4] - 2026-10-14

Google sign-in on iPhone Safari.

- Sign in on iPhone and iPad (Safari, and other iOS browsers) stays in the same tab. The popup path never returned to the app: the first tap only tried One Tap, which those browsers do not show, and the next tap was cancelled when Google severed the popup
- Account has its own **Sign in with Google** button, using the same sign-in as the header
- After Google, you land back on the page you started from
- Desktop popup sign-in waits for the result instead of treating an early focus return as cancel
- The server accepts the raw sign-in nonce and the SHA-256 digest Google Identity Services may put in the ID token

## [1.0.3] - 2026-10-13

Party @Ampi recipe suggestions in group chat.

- Fix empty Ampi bubbles when the model returns tool actions with a blank `reply` (common after the OpenRouter adapter): synthesize reply text, show recipe draft cards, and never post a message with no body
- Party chat: recipe draft cards with **Save to my recipes** and **Add to party meals**; optional auto-add when the user asks to add to the party menu
- Richer party context (meals, claims, conversation turns) for @Ampi; failed generations post a visible error instead of silent skip
- **Ask Ampi** pre-fills `@Ampi give us a delicious meal from our pantries` (edit before send)
- Opt-in **Share my pantry with this party** (minimal snapshot on Neon); combined pantry context for meal suggestions; recipe cards show who has each ingredient and what is missing
- Add missing ingredients to your grocery list or register them on the party meal to claim, from the recipe card or a chat command (`add the missing ingredients to my grocery list` / `as party meal items to claim`)
- Chat claims without waiting on the model: "I'll bring the tortillas" and "@Ampi Katie is bringing cheese" update party meal ingredient claims and Ampi confirms in chat
- Failed @Ampi replies show a tap-to-retry control; already-saved empty JSON bubbles are repaired on screen from the stored recipe action
- Privacy policy and in-app data note describe opt-in party pantry snapshots

## [1.0.2] - 2026-10-12

Mobile layout polish for pantry lists.

- Move floating add (and grocery AI/add) buttons to the bottom-left, above the tab bar, with extra list padding so row actions stay tappable on iPhone Safari
- Party chat on mobile Safari: pin the composer to the keyboard (`visualViewport`) and collapse party header chrome while typing
- Fix party chat not persisting or syncing in production: `chat_post` and `changes_since` no longer require a Google session when a valid party member token is present (expired owner session had been causing silent 401s on poll and send); advance chat poll cursor after send; Playwright two-client party chat E2E
- Party @Ampi: parse JSON model replies (same parser as Ampi chat), store/display reply text only, repair already-saved JSON bodies on render; match Ampi bubble styling in dark mode (`surface` + primary text)
- Party chat persistence: load full history on open (`chat_history` with pagination), refresh owner member token when missing, loading spinner and retry on history failure, failed sends stay visible with tap-to-retry
- Ampi `update_recipe`: normalize recipe ids across models (`10`, `"#10"`, `recipeId`), infer id from reply/context, validate via recipe template coercion, update nutrition fields, clearer errors
- OpenRouter model-agnostic Ampi adapter: canonical tool schema, per-model strategy (native tools → `json_schema` → prompt JSON), unified extract/normalize/repair + fallback; owner chat model picker lists all text models; contract tests and optional live smoke script
- TikTok / social link import in Ampi: safe API JSON parsing (no raw `JSON.parse` on HTML errors), server caption extraction via the adapter, friendly client errors; block saving recipes without a real title (infer from content or fail with a clear message)
- ElevenLabs TTS: remove hardcoded `amplifood_ampy` pronunciation dictionary; use Ampi→Ampy text substitution; retry without dictionary locators on 404

## [1.0.1] - 2026-10-12

Release at git tag `v1.0.1` (commit `f65512d`).

- In-app version footer, build metadata, and bundled release notes (#74)
- Party and recipe cover images: square thumbs, EXIF-aware crop, cache-busted URLs (#75)

## [1.0.0] - 2026-10-12

First tagged stable web release: party group chat, demo data tools, and AI model reliability.

- Party group chat with @Ampi, attachments, and polling (#71, #72)
- Fill or remove demo data from Account (#70)
- Auto-generate recipe images after save (#67)
- Safer Ampi recipe saves and corrupted-recipe repair (#68)
- Owner OpenRouter model picker filters chat-only models and retries bad requests (#73)

## [0.13.0] - 2026-10-12

Richer recipe and party visuals.

- Cover images, lightbox, party thumbnails, and Ampy TTS (#69)

## [0.12.0] - 2026-10-12

Pantry upgrades and Ampi polish.

- Pantry freshness and amount sliders with photo estimates (#66)
- More reliable Ampi JSON replies and ElevenLabs expressiveness (#65)
- Visible Clear chat on Ampi (#64)
- Ampi voice: listen until you stop (Safari-friendly, 2-minute cap) (#63)
- Fix Grocery tab crash on mobile Safari (#62)
- Pantry expiration date picker and expiring-soon badges (#61)
- Party identity dedupe migration (unblocks backup and sync) (#60)

## [0.11.0] - 2026-10-11

Cross-tab sync, party live updates, and recipe enhancements.

- Async AI enhance, nutrition on Ampi recipes, chat auto-scroll (#59)
- Clear Ampi chat, sidebar highlight, cross-tab sync refresh (#58)
- Ampi vision: image attachments on platform OpenRouter path (#57)
- Party live auto-sync with server-first mutations (#56)
- Fix duplicate party member list entries (#55)

## [0.10.0] - 2026-10-11

Encrypted cloud sync and desktop web layout.

- Encrypted cloud sync and unified Google sign-in (#53)
- Desktop layout (1024px+) with sidebar navigation (#54)

## [0.9.0] - 2026-10-11

Party refresh and Ampi chat experience.

- Compact party redesign with meal claim progress (#50)
- Add recipe from link on Add Recipe (#49)
- TikTok /t/ links, photo posts, and Ampi link import fixes (#48)
- Safari tab take-over and back-button fixes on web (#46, #47)
- Ampi chat: iMessage-style keyboard, Markdown replies, ElevenLabs voice with audio tags (#51)
- iOS Safari Ampi composer keyboard gap fix (#52)

## [0.8.0] - 2026-10-10

Google sign-in, cloud backups, and live parties.

- Google sign-in, live-only parties, and cloud backups (#45)
- Party OG image rendering fix (#44)
- Party live sync via Neon Postgres (#42)
- Owner ElevenLabs voice through /api/ai/chat (#41)
- Resilient web database open (OPFS multi-tab) (#40)
- Link-first party invites, join receipts, member management (#39)

## [0.7.0] - 2026-10-10

Recipe images, imports, and party email.

- Platform AI OpenRouter recipe image generation (#37)
- Ampi recipe follow-ups and image generation UX (#38)
- Party email sync via Resend (signed payloads) (#31)
- Instagram recipe import: captions, video AI, Ampi upload (#32)
- Server-side recipe URL import for web (#29)
- Security hardening for server AI proxy (#28)
- Vercel Hobby 12-function limit: shared code moved to api/_lib (#35)
- Deploy and /api/ai/chat hotfixes (#33, #36)

## [0.6.0] - 2026-10-10

Ampi depth: meal planning, attachments, redesign, and memory.

- Ampi full meal planning, ElevenLabs BYOK voice, privacy clarity (#27)
- Ampi chat attachments (images, PDFs, recipe files) (#23)
- AmpliFood redesign: layout cleanup and motion system (#24)
- Chat context persistence and Ampi memory store (#25)
- Faster web startup: run bundle after first frame (#26)

## [0.5.0] - 2026-10-10

Platform AI with Google sign-in and OpenRouter.

- Platform AI: Google sign-in and OpenRouter proxy (#17)
- Account and Plus web UX on amplifood.vercel.app (#18)
- Hotfixes: Google client IDs unset, Vercel ESM/jose, OPFS lock, retired OpenRouter model (#19–#22)

## [0.4.0] - 2026-10-10

Ampi assistant launch.

- AmpliFood Plus and credit packs (client-side, platform AI stubbed) (#11)
- Ampi phase 1: chat-first home, tool calls, on-device voice, AI labels (#12)
- Ampi onboarding and interactive tour (#13)
- Architecture diagram at /architecture (#14)
- Web: lazy routes, 480px layout, recipe empty states (#15)
- Copy and architecture updates for Ampi launch (#16)

## [0.3.0] - 2026-10-07

AmpliFood rebrand and web deploy readiness.

- AmpliFood rebrand and web deploy readiness (#5)
- Fix deep-link 404s on Vercel (#7)
- Camera barcode scanning on web (#8)
- Trim Android/iOS permissions to camera and system photo picker (#9)
- Legal pages: /about, /privacy, /terms, /support, /accessibility (#10)

## [0.2.0] - 2025-08-30

Web-native bring-your-own-key flow.

- Web native BYOK (#3)

## [0.1.0] - 2025-08-30

Initial web and Expo Go support with on-device BYOK.

- Web + Expo Go support with on-device BYOK (#1)
