# User safety — how Food Dude stores your data

Food Dude is a **Bring Your Own Key (BYOK)** app. You paste an API key you already own. There is no Food Dude backend for accounts, keys, recipes, or preferences. Nothing in this document is a substitute for reading your AI provider’s own privacy policy.

## Honest storage model

Your data stays on this device. API keys are stored in the OS encrypted keychain. Recipes, pantry, and preferences live in a local database that never leaves your phone.

That is the accurate line. The app does **not** encrypt every file on disk. SQLite is sandboxed by iOS/Android and is never uploaded, but the database file itself is not extra-encrypted by Food Dude.

## What lives where

| Data | Store | Encrypted by the OS? | Leaves the device? |
| --- | --- | --- | --- |
| Anthropic / OpenAI / xAI / Gemini API keys | `expo-secure-store` (iOS Keychain / Android Keystore). Web fallback: AsyncStorage in this browser only. | Yes on native | Only when **you** send a request to that provider |
| Selected provider + model ids | SecureStore (same path as keys) | Yes on native | No |
| Cached model lists | AsyncStorage (not a secret) | No (on-device) | No |
| Theme (`themeMode`) and AI Chef helper collapse | AsyncStorage | No (on-device) | No |
| Account profile: name, username, email, avatar, flavor preferences, recipes cooked | On-device SQLite `users` table | No extra encryption | No |
| Recipes, pantry, grocery, meal plans, parties, AI chat history, workouts, mood, lab panels | On-device SQLite (`fooddude.db`) | No extra encryption | No, except when you ask AI Chef to use them in a prompt |

Secrets stay in SecureStore. Do not move API keys into SQLite.

## Bring Your Own Key

- Food Dude does **not** ship a shared `EXPO_PUBLIC_` Gemini (or other) key. Those values are compiled into the JS bundle and would be public.
- You add a key in **Account → AI provider → Save key**.
- Remove it with **Account → Clear**. That deletes the key, selected models, and cached model lists for that provider on this device.
- Pantry, planner, grocery, and the recipe book keep working with no key.

## What leaves the device

Food Dude has no account server. The only network calls that carry your content are ones you initiate:

1. **Your chosen LLM provider** (Anthropic, OpenAI, xAI, or Google Gemini). Chat, recipe import, image analysis, cost estimates, and recipe photos go to that provider with the key stored on this device. Flavor preferences and pantry context are included in those prompts when you use AI Chef.
2. **Open Food Facts** for barcode lookups. The request is a public product lookup, not your account profile.
3. **A recipe URL you import**, fetched so the app can parse the page.

Labs and other health-style notes stay on device. If you later ask an LLM about them, only the text you send in that prompt leaves the phone.

## How to remove keys and data

- **One provider key:** Account → AI provider → **Clear**.
- **Profile / flavor preferences:** Account → Edit Profile and clear the fields, then Save. Rows stay local in SQLite.
- **Everything:** uninstall the app, or clear the app’s storage. That removes SQLite, AsyncStorage, and Keychain/Keystore entries for Food Dude.

## Schema note (flavor preferences)

Flavor preferences are a column on the local `users` table (`flavor_preferences`). New installs get it from `CREATE TABLE`. Existing Expo Go databases that already had `users` get the column from a versioned migration (`ALTER TABLE … ADD COLUMN`) plus a boot-time `PRAGMA table_info` check, so saving your profile does not require wiping the database.

## What this is not

- Not a medical device and not HIPAA-certified storage.
- Not full-disk encryption of recipes or pantry.
- Not a cloud backup. If you lose the phone and have no OS backup, the local database is gone.
- Not a Food Dude-hosted account. Email in Account is a local label only.

## Further reading

- Account screen disclaimer (above AI provider settings)
- Account → Privacy
- [README.md](./README.md) — Privacy & Data
