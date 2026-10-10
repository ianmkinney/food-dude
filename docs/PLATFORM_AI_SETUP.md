# Owner platform AI setup (Ian)

AmpliFood's **owner-only** platform AI lets Ian sign in with Google and run AI through an OpenRouter key on Vercel. **Regular users are not asked to sign in**; they keep bring-your-own-key (BYOK) only.

The proxy is **off until `ALLOWED_EMAILS` is set** on Vercel. If that variable is missing or empty, all `/api/auth/*` and `/api/ai/*` routes return `503 platform_disabled`.

## 1. Google Cloud OAuth clients

1. Open [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → **Credentials**.
2. Configure the **OAuth consent screen** (External or Internal, as appropriate).
3. Create **three OAuth 2.0 Client IDs** (or Web + iOS + Android as needed):
   - **Web** — Authorized JavaScript origins: `https://amplifood.vercel.app` (and `http://localhost:8080` for local web dev if you use it). Authorized redirect URIs: not required for GIS ID-token flow on web.
   - **iOS** — Bundle ID: `com.fooddude.app`
   - **Android** — Package: `com.fooddude.app` + SHA-1 from your signing key (EAS credentials).
4. Copy each client ID.

## 2. OpenRouter

1. Create an API key at [openrouter.ai](https://openrouter.ai/).
2. Pick a default cheap model (example: `google/gemini-2.0-flash-001`).
3. Set `OPENROUTER_ALLOWED_MODELS` to a short comma-separated allowlist of model slugs you are willing to pay for.

## 3. Vercel environment variables (amplifood project)

Set these in the Vercel dashboard for **Production** (and Preview if you want to test PRs):

| Variable | Required | Description |
| --- | --- | --- |
| `ALLOWED_EMAILS` | **Yes** | Comma-separated Google account emails allowed to use the proxy (e.g. Ian's Gmail). **If unset, the proxy refuses all traffic.** |
| `SESSION_SECRET` | Yes | Long random string (32+ bytes) for signing session JWTs. |
| `GOOGLE_CLIENT_IDS` | Yes | Comma-separated OAuth client IDs (web, iOS, Android) used to verify Google ID tokens. |
| `OPENROUTER_API_KEY` | Yes | Server-side only; never expose to the client or `EXPO_PUBLIC_*`. |
| `OPENROUTER_DEFAULT_MODEL` | Recommended | Default model slug when the client does not specify one. Must appear in `OPENROUTER_ALLOWED_MODELS` if that list is set. |
| `OPENROUTER_ALLOWED_MODELS` | Recommended | Comma-separated allowlist (e.g. `google/gemini-2.0-flash-001,anthropic/claude-3.5-haiku`). |
| `OPENROUTER_MAX_OUTPUT_TOKENS` | Optional | Cap per request (default `4096`, max `8192`). |
| `PLATFORM_AI_DAILY_REQUESTS` | Optional | Owner daily request cap (default `500`). |
| `PLATFORM_AI_DAILY_TOKEN_BUDGET` | Optional | Owner daily estimated token budget (default `500000`). |
| `KV_REST_API_URL` | Optional* | Vercel KV / Upstash REST URL for usage counters across serverless instances. |
| `KV_REST_API_TOKEN` | Optional* | Matching REST token. |

\*If KV is not configured, usage limits use an **in-memory store per lambda instance** (fine for local `vercel dev`, not accurate in production). For production, attach **Vercel KV** or **Upstash Redis** and set `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`).

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
3. On a device or web build with the Google client IDs baked in: **Account → Owner sign-in → Sign in with Google** (Ian’s allowlisted email only).
4. Leave BYOK in Account for normal testing; owner routing is: **BYOK key wins**, else **owner session** → proxy.

## 6. Clerk / other auth vendors

Not used. Google ID-token verification + a signed session JWT keeps the stack minimal. A marketplace IdP would add cost and another privacy processor without helping end users (they never sign in).

## 7. Privacy

Update `public/privacy.html` after Legal review (draft in this PR). Prompts are not logged; only per-day usage counters are stored server-side for the owner account.
