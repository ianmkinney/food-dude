# Platform AI (owner OpenRouter proxy)

AmpliFood has two ways to run AI:

- **BYOK (everyone):** the user's own Anthropic, OpenAI, xAI or Gemini key on the device.
- **Owner platform AI:** after **Account → Sign in with Google** with an allowlisted email, text / multimodal / image requests can use AmpliFood's Vercel **`POST /api/ai/chat`** proxy to **OpenRouter** (per-tester keys in `OPENROUTER_KEYS_JSON` and/or Ian's `OPENROUTER_API_KEY`). The proxy is off unless `ALLOWED_EMAILS` is set. Regular users are never prompted to sign in for AI.

Setup env vars: `docs/PLATFORM_AI_SETUP.md`. Product / credits roadmap: `PLATFORM_AI.md` at the repo root.

## Owner model pickers (Account)

When the signed-in Google account is **allowlisted** (`platformAiAllowed` from `/api/auth/session`), Account shows two searchable pickers:

| Picker | Purpose | Default (server) |
| --- | --- | --- |
| **Chat model** | `generateText` / `generateMultimodal` via the owner proxy | `OPENROUTER_DEFAULT_MODEL`, else first `OPENROUTER_ALLOWED_MODELS` entry, else `google/gemini-2.5-flash` (with `OPENROUTER_FALLBACK_MODELS` / built-in fallbacks on upstream rejection) |
| **Image model** | `generateImage` (`mode: 'image'`) | `OPENROUTER_IMAGE_MODEL` or `google/gemini-2.5-flash-image` |

### Loading the list

- Client: `POST /api/ai/chat` with `{ "mode": "models" }` and the owner session JWT.
- Server: `GET https://openrouter.ai/api/v1/models` (OpenRouter key for that owner), cached in memory for **~1 hour** (`api/_lib/openRouterModels.js`).
- Response shape:
  - `defaults: { chat, image }`
  - `chatModels`: models whose `architecture.output_modalities` includes `text`
  - `imageModels`: models whose modalities include `image`
  - Each row: `id`, `name`, `pricePerMillion` (USD, max of prompt/completion per-token × 1M)

Pickers are **hidden** for signed-out users and for signed-in users who are not allowlisted.

### Persisting and sending the choice

- Device storage (AsyncStorage): `amplifood.owner.openrouter.chatModel`, `amplifood.owner.openrouter.imageModel` (`src/platform/ownerModelPreferences.ts`).
- Every owner proxy call from `livePlatformAi` includes `model` when a preference is set.
- Server **only honors** `model` for allowlisted owner sessions (already enforced by `/api/ai/chat`).
- Overrides must be an **id present in the cached OpenRouter catalog** and match the request kind (chat vs image). Unknown ids are ignored and server defaults are used.

### Code map

| File | Role |
| --- | --- |
| `api/ai/chat.js` | `mode: 'models'`, chat/image routing, OpenRouter upstream |
| `api/_lib/openRouterModels.js` | Catalog fetch, cache, validation |
| `src/platform/ownerModelsApi.ts` | Client fetch for Account pickers |
| `src/components/OwnerModelPickers.tsx` | Searchable UI on Account |
| `src/monetization/livePlatformAi.ts` | Attaches saved `model` to owner requests |

## OpenRouter stats card (Account)

Allowlisted owners see an **OpenRouter usage** card (with **Refresh**) above the model pickers.

- Client: `POST /api/ai/chat` with `{ "mode": "stats", "refresh"?: true }`.
- Server aggregates OpenRouter account data with the **same per-user API key** used for chat (`resolveOpenRouterApiKey`). Keys are never sent to the client.
- Responses are cached **~60 seconds** per signed-in email; `refresh: true` bypasses the cache.

| Stat | OpenRouter endpoint | Notes |
| --- | --- | --- |
| Credit balance | `GET /v1/credits` | `total_credits − total_usage` (USD) |
| Spend today / week / month | `GET /v1/key` | `usage_daily`, `usage_weekly`, `usage_monthly`, plus `limit` / `limit_remaining` when present |
| API calls this week | `GET /v1/activity` | Sum of `requests` for UTC dates in the current week (Monday–Sunday) |

**Calls this week** requires a server-side **management / provisioning key**: set `OPENROUTER_PROVISIONING_KEY` in Vercel (OpenRouter dashboard → create a management key with activity access). When unset, the calls row is hidden and the card shows a one-line note. Activity requests use the provisioning key only; optional `api_key_hash` filters to the tester’s key when `/v1/key` returns a hash.

If a single stat fails upstream, the card shows a short friendly error for that row and still renders the rest.

Implementation: `api/_lib/openRouterStats.js`, `src/components/OwnerOpenRouterStatsCard.tsx`.

## ElevenLabs (owner voice)

Voice list / TTS also use `/api/ai/chat` with `mode: 'voices'` or `mode: 'tts'` so the Hobby 12-function limit is not exceeded.

## Local tests

- `node scripts/test-owner-api.mjs` — owner auth, model list, catalog validation, fallback behavior (stubbed OpenRouter).
- `npm run verify:api` — imports all `api/**/*.js` modules including `openRouterModels.js`.
