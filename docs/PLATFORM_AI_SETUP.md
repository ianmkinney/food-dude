# Owner platform AI setup (Ian)

AmpliFood's **owner-only** platform AI lets Ian and a small allowlist of testers sign in with Google and run AI through **per-user OpenRouter keys** on Vercel. **Regular users are not asked to sign in**; they keep bring-your-own-key (BYOK) only.

The proxy is **off until `ALLOWED_EMAILS` is set** on Vercel. If that variable is missing or empty, all `/api/auth/*` and `/api/ai/*` routes return `503 platform_disabled`.

**No database or KV store** is required. Spending caps are enforced by **OpenRouter credit limits on each API key**, not by AmpliFood counters.

## 1. Google Cloud OAuth clients

1. Open [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → **Credentials**.
2. Configure the **OAuth consent screen** (External or Internal, as appropriate).
3. Create **three OAuth 2.0 Client IDs** (or Web + iOS + Android as needed):
   - **Web** — Authorized JavaScript origins: `https://amplifood.vercel.app` (and `http://localhost:8080` for local web dev if you use it). Authorized redirect URIs: `https://amplifood.vercel.app/auth/google-callback` for the popup/redirect flow.
   - **iOS** — Bundle ID: `com.fooddude.app`
   - **Android** — Package: `com.fooddude.app` + SHA-1 from your signing key (EAS credentials).
4. Copy each client ID.

## 2. OpenRouter keys (per tester)

Create **one OpenRouter API key per person** who should use platform AI (Ian + testers). Cap spend on each key in OpenRouter so a tester cannot burn unlimited credits.

### Create a capped key in OpenRouter

1. Sign in at [openrouter.ai](https://openrouter.ai/) → **Keys** (or **Settings → API keys**).
2. **Create key** — give it a label (e.g. `AmpliFood tester Jane`).
3. Set a **credit limit** (or monthly budget) appropriate for testing — OpenRouter returns **HTTP 402** when that key’s limit is hit; AmpliFood maps that to a friendly “Daily AI limit reached” message.
4. Copy the key (`sk-or-…`). **Never** commit keys or put them in `EXPO_PUBLIC_*` variables.

Repeat for each allowlisted email. Ian’s primary key can be stored as `OPENROUTER_API_KEY` (see below) instead of inside the JSON map.

### Server mapping

Set **`OPENROUTER_KEYS_JSON`** on Vercel (Production / Preview as needed) to a JSON object: **lowercase email → API key**.

```json
{
  "jane.tester@gmail.com": "sk-or-v1-…",
  "bob.tester@gmail.com": "sk-or-v1-…"
}
```

- Keys are looked up by the **signed-in Google account email** (lowercase).
- **`OWNER_EMAIL`** (optional) marks Ian’s account. If omitted, the **first** entry in `ALLOWED_EMAILS` is treated as the owner.
- The owner may use **`OPENROUTER_API_KEY`** when their email is not listed in `OPENROUTER_KEYS_JSON`.
- Any other allowlisted email **must** have an entry in `OPENROUTER_KEYS_JSON`; otherwise `/api/ai/chat` returns **403** (`no_platform_key`).

Pick a default cheap model (example: `google/gemini-2.5-flash`) and set `OPENROUTER_ALLOWED_MODELS` to a short comma-separated allowlist of model slugs you are willing to pay for.

## 3. Vercel environment variables (amplifood project)

| Variable | Required | Description |
| --- | --- | --- |
| `ALLOWED_EMAILS` | **Yes** | Comma-separated Google emails allowed to sign in and call the proxy. **If unset, the proxy refuses all traffic.** |
| `SESSION_SECRET` | Yes | Long random string (32+ bytes) for signing session JWTs (24h TTL). |
| `GOOGLE_CLIENT_IDS` | Yes | Comma-separated OAuth client IDs (web, iOS, Android) used to verify Google ID tokens (JWKS + nonce). |
| `OPENROUTER_API_KEY` | Yes* | Ian’s server-side OpenRouter key (`sk-or-…`). Used for the owner account when not listed in `OPENROUTER_KEYS_JSON`. |
| `OPENROUTER_KEYS_JSON` | Recommended | JSON map of `email → sk-or-…` for testers (and optionally Ian). Server-only secret. |
| `OWNER_EMAIL` | Optional | Ian’s Google email (lowercase). Defaults to first `ALLOWED_EMAILS` entry. |
| `OPENROUTER_DEFAULT_MODEL` | Recommended | Default model slug when the client does not specify one. |
| `OPENROUTER_ALLOWED_MODELS` | Recommended | Comma-separated allowlist (e.g. `google/gemini-2.5-flash`). |
| `OPENROUTER_MAX_OUTPUT_TOKENS` | Optional | Cap per request (default `4096`, max `8192`). |

\*At least one of `OPENROUTER_API_KEY` (for owner) or `OPENROUTER_KEYS_JSON` entries must cover every allowlisted user who should call AI.

**Not used:** Vercel KV, Upstash, or any other database for AI quotas.

## 4. Expo / EAS public env (client)

Set at **build time** (EAS secrets or `.env` for web export on Vercel):

| Variable | Description |
| --- | --- |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Web OAuth client ID (GIS + native webClientId). |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | iOS client ID. |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Android client ID. |
| `EXPO_PUBLIC_API_BASE_URL` | Optional. Defaults to `https://amplifood.vercel.app/api` on native; same-origin `/api` on web. |

## 5. Deploy

1. Merge the PR; Vercel deploys static `dist` **and** `/api/*` serverless functions from the repo root.
2. Confirm env vars on the deployment.
3. On a device or web build with the Google client IDs baked in: **Account → Owner sign-in → Sign in with Google** (allowlisted email only).
4. Leave BYOK in Account for normal testing; owner routing is: **BYOK key wins**, else **owner session** → proxy.

## 6. Resend (party invite / sync emails)

Party collaboration uses **email links** with signed payloads in the URL **fragment** (never sent to server logs). The server only relays email when someone is signed in with an allowlisted Google account; otherwise the app falls back to `mailto:`.

| Variable | Required | Description |
| --- | --- | --- |
| `RESEND_API_KEY` | For server email | API key from [Resend](https://resend.com/). If unset, `/api/party/email` returns `503` and the app uses `mailto:`. |
| `RESEND_FROM` | Optional | From address (default `onboarding@resend.dev` until a domain is verified). |

Uses the same `ALLOWED_EMAILS` / owner session gate as `/api/ai/chat`. Signed-link parties still do not store party payloads on the server.

## 7. Neon Postgres + Vercel Blob (live parties only)

Live party sync stores **party metadata only** (name, optional cover image, member display names, meals) in Neon. Everything else (recipes, pantry, grocery, meal plans) stays on device.

1. In the [Vercel dashboard](https://vercel.com/dashboard), open the **amplifood** project → **Storage** → add **Neon** from the Marketplace. Vercel injects `POSTGRES_URL` (and often `DATABASE_URL`) into the project.
2. Optionally add **Vercel Blob** for party cover photos (`BLOB_READ_WRITE_TOKEN`). If Blob is not configured, cover images are stored as `bytea` in Postgres and served from `/api/party?action=image&partyId=…`.
3. Schema is applied **automatically** on the first party API request (idempotent DDL + Postgres advisory lock per cold start). Set `PARTY_AUTO_MIGRATE=0` to disable auto DDL. Optional manual run: `npm run party-db:migrate` (same statements).

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` or `POSTGRES_URL` | For live parties | Neon connection string from the Vercel Neon integration. |
| `BLOB_READ_WRITE_TOKEN` | Recommended | Vercel Blob read/write token for public party cover images. |

API surface (single serverless entrypoint `api/party/index.js`, actions via `?action=`): `create`, `get`, `join`, `leave`, `remove_member`, `update_meals`, `upload_image`, `changes_since`, `migrate`. Invite previews: `/p/<token>` → `api/p.js` (Open Graph HTML + redirect to `/party?inviteToken=…`).

Owner-only actions require the same Google owner session as platform AI. Joiners authenticate with the invite token plus a per-member secret returned on join.

## 8. Clerk / other auth vendors

Not used. Google ID-token verification (JWKS) + nonce + a signed session JWT keeps the stack minimal.

## 9. Privacy

Prompts are not logged on the server. Per-minute rate limiting is **best-effort in-memory** per serverless instance (abuse throttle only, not a billing control). Billing and daily caps are enforced by **OpenRouter per-key limits**.
