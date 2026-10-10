# Platform AI, Plus and credits

AmpliFood has two ways to run AI:

- **BYOK (everyone):** the user's own Anthropic, OpenAI, xAI or Gemini key, stored on the device, calling the provider directly. This is the default for all users.
- **Owner platform AI (Ian only):** after **Account → Owner sign-in** with an allowlisted Google account, AI requests can go through AmpliFood's Vercel `/api/ai/chat` proxy to **OpenRouter** (Ian’s `OPENROUTER_API_KEY` on the server). **Regular users are never prompted to sign in.** Routing: BYOK key first, else owner session, else "Add an API key". Setup: `docs/PLATFORM_AI_SETUP.md`. The proxy is **disabled unless `ALLOWED_EMAILS` is set** on Vercel.
- **Plus / credit packs (future):** store purchases and a credit ledger are still stubbed (`platformAi.isLive` remains `false` for IAP until receipt validation exists).

## Pricing (locked)

| Product ID | Type | Price | Credits |
| --- | --- | --- | --- |
| `amplifood_plus_monthly` | Auto-renewing subscription | $6.99 / month | 200 per month |
| `amplifood_credits_40` | Consumable | $1.99 | 40 |
| `amplifood_credits_120` | Consumable | $4.99 | 120 |
| `amplifood_credits_350` | Consumable | $12.99 | 350 |

Free has no platform AI; BYOK works on Free. **Voice at launch:** on-device phone TTS only (`expo-speech`). A hosted premium voice may come later; ElevenLabs proxy work is blocked until commercial approval. Store prices come from the store at runtime; the list prices above are only a fallback and the web copy.

Provisional credit costs (`src/monetization/products.ts`, the server is the authority): AI Chef message 1, grocery cost estimate 1, recipe import from text or a link 2, from screenshots 3, AI recipe photo 5.

## What's in the app

| File | Role |
| --- | --- |
| `src/monetization/products.ts` | Product IDs, plans, packs, credit costs |
| `src/monetization/iap.ts` / `iap.web.ts` | `expo-iap` wrapper (connect, prices, purchase, restore, finish). The web build never loads `expo-iap` and reports purchases as mobile-only. |
| `src/monetization/entitlements.ts` | Local, **unverified** cache of Plus status and pack credits (AsyncStorage `amplifood.entitlements.v1`). Drives the UI and routing only. |
| `src/monetization/platformAi.ts` | `PlatformAiClient` interface; owner `generateText` / `generateMultimodal` call `livePlatformAi` → `/api/ai/chat`. IAP paths still stubbed. |
| `src/platform/ownerSession.ts` | Stores owner session JWT; exchanges Google ID token at `/api/auth/google`. |
| `api/ai/chat.js` | Owner-only OpenRouter proxy (streaming upstream; client uses JSON mode). |
| `src/monetization/MonetizationContext.tsx` | Connects to the store at launch, so unfinished transactions replay. Calls `verifyPurchase`, then grants locally, then finishes the transaction. |
| `src/screens/PaywallScreen.tsx` | Tiers, prices, credit costs, Restore purchases, renewal terms. Opened from Account → AmpliFood Plus, or `/plus` on web. |
| `src/services/aiSettings.js` → `requireAiConfigured` | Routing: own key → `byok`; no key but Plus/credits → `platform`; neither → "Add an API key". |
| `src/services/aiClient.js` | `generateText` / `generateMultimodal` / `generateImage` hand `route: 'platform'` to `platformAi` with a `feature` tag for billing. |

**Purchase safety switch.** Release builds show "Coming soon" instead of buy buttons until `platformAi.isLive` is true, so nobody can pay for credits that do nothing yet. `__DEV__` builds keep the buttons, for sandbox testing.

## Backend that has to exist

### 1. Identity

There are no accounts today. The ledger needs a stable owner per purchaser:
- **iOS:** generate a UUID on first launch and pass it as `appAccountToken` in `requestPurchase` (`request.apple.appAccountToken`). It then comes back inside every signed transaction.
- **Android:** pass the same UUID as `obfuscatedAccountId`.
- Store the UUID in SecureStore. Restoring on a new device maps back via `originalTransactionId` / `purchaseToken`.
- A real sign-in, if added later, can merge these anonymous IDs.

### 2. Receipt validation (`POST /v1/purchases/verify`)

- **Input:** platform, productId, and either the iOS signed transaction (JWS, from StoreKit 2 via `expo-iap`) or the Android `purchaseToken`, plus the install UUID.
- **Apple:** verify the JWS chain, or call the App Store Server API `GET /inApps/v1/transactions/{id}`.
- **Google:** Play Developer API `purchases.subscriptionsv2.get`, or `purchases.products.get` for packs. A service account is needed.
- Reject replays: transaction IDs and purchase tokens are unique keys.
- **Response:** `PurchaseVerification` (`verified` with balance and plus expiry / `rejected` / `unavailable`).
- **Order matters:** verify and credit on the server *before* the client calls `finishTransaction`. Android auto-refunds anything not acknowledged within 3 days, and iOS replays unfinished transactions. The current client grants locally when the stub returns `unavailable`. Remove that fallback when going live.

### 3. Subscription lifecycle

- **Apple:** App Store Server Notifications v2 webhook (`DID_RENEW`, `EXPIRED`, `REFUND`, `DID_CHANGE_RENEWAL_STATUS`, `GRACE_PERIOD_EXPIRED`…).
- **Google:** Real-time Developer Notifications through Pub/Sub, then `subscriptionsv2.get`.
- Keep `plus_active_until` per owner, and treat grace and billing-retry periods as active.

### 4. Credit ledger

- Append-only entries: `grant_monthly` (200 at each Plus period start; decide whether unused credits roll over), `grant_pack` (+40/120/350), `debit` (per request, by `feature`), `refund` (store refund: claw back, don't go negative silently).
- Spend monthly credits first, then pack credits.
- Debit atomically with the AI request: reserve, call the provider, then commit or release on failure.
- `GET /v1/credits` returns `CreditBalance` (`monthlyRemaining`, `purchasedRemaining`, `resetsAt`) for the Account row and paywall.

### 5. AI proxy (`POST /v1/ai/{text|multimodal|image}`)

- Authenticate the install. Rate-limit per owner and per IP. Check the balance and reserve `CREDIT_COSTS[feature]`.
- Call the provider with AmpliFood's own key, kept server-side. Never ship it in the app; `EXPO_PUBLIC_*` values are public.
- Same request and response shapes as `PlatformTextRequest`, `PlatformMultimodalRequest` and `PlatformImageRequest` → `string` or `{ imageUri }`.
- Cap input size: images are already downscaled to 1568 px on the client.
- Log usage per feature, without storing prompts beyond what's needed for abuse handling.

### 6. Premium voice proxy (`POST /v1/voice/tts`) — not at launch

> **Blocked:** needs ElevenLabs Scale plan or written OK before building this. The shipping app uses on-device TTS only.

- **Who:** Plus subscribers only (checked against the ledger owner's `plus_active_until`).
- **Request:** `{ text, voice: "sous" }` (`PlatformSpeechRequest`). The server maps `voice: "sous"` to AmpliFood's Voice Design voice ID and model; the client never sees either.
- **Streaming:** call ElevenLabs' streaming endpoint (`/v1/text-to-speech/{voice_id}/stream`, `mp3_44100_128`, a low-latency model such as `eleven_flash_v2_5`) and pipe the chunks to the app as `audio/mpeg` with chunked transfer, so playback starts before synthesis finishes. Respond with headers `X-Characters-Used` / `X-Characters-Left`; the client wraps this as `PlatformSpeechResult`.
- **Per-user monthly character cap:** provisional `PLUS_MONTHLY_VOICE_CHARACTERS = 30000` (`products.ts`, about 30 minutes of speech). It resets with the Plus period. Over the cap, return `429 { reason: "voice_cap" }`; the app falls back to the phone voice and says so. Voice doesn't spend AI credits (decide later whether packs can top it up).
- **Metering:** count characters **after** the app's `toSpokenText` cleanup, server-side, before calling ElevenLabs. Record `(owner, characters, model, ms, cached)` per request; reserve before the call and commit on success, as with credits. Alert on spend per day.
- **Limits:** max 1,000 characters per request; rate-limit per owner and per IP; refuse when the Plus entitlement is unverified.
- **Caching:** cache audio by hash of `(voice, model, text)` for repeated scripted lines. Scripted onboarding uses the phone voice, so this mainly helps common replies.
- **Keys and compliance:** the ElevenLabs key lives only in the server environment. The account must be on a Starter-or-higher plan (commercial rights), the Sous voice must be a Voice Design voice, and training on our data must be off. This is pending Ian's spend approval.
- **Client:** `PlatformAiClient.synthesizeSpeech` (here) and `PlatformVoiceClient` (#12, `src/voice/platformVoice.ts`) are the same call. Merge them into one live client when the backend exists.

### 7. Client switch-over

1. Implement a `livePlatformAi: PlatformAiClient` that calls the endpoints above, and export it as `platformAi`.
2. Pass `appAccountToken` / `obfuscatedAccountId` in `iap.ts` → `startPurchase`.
3. Drop the local credit grant in `MonetizationContext` once verification returns real balances, and drive the Account row from `getBalance()`.
4. Update `/privacy` and the store privacy labels. Platform AI sends prompts to an AmpliFood server, which changes the "requests go straight to your provider" statement for those users.

## Store setup (not done here)

- Create the five products in App Store Connect and Play Console, both subscriptions in one subscription group / base plan.
- Accept the Paid Apps agreement and banking/tax setup.
- Test with sandbox / license-tester accounts on a **development build**. `expo-iap` is a native module and doesn't run in Expo Go.
- Apple requires the renewal terms (shown on the paywall), links to Terms of Use and Privacy Policy (on the paywall, pointing to `/terms` and `/privacy`; `/terms` ships with PR #10), and a working Restore button.
