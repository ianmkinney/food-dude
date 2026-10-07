# User safety — how AmpliFood stores your data

AmpliFood is a **Bring Your Own Key (BYOK)** app. You paste an API key you already own. There is no AmpliFood backend for accounts, keys, recipes, or preferences. Nothing in this document is a substitute for reading your AI provider’s own privacy policy.

## Honest storage model

Your data stays on this device. API keys are stored in the OS encrypted keychain. Recipes, pantry, and preferences live in a local database that never leaves your phone.

That is the accurate line. The app does **not** encrypt every file on disk. SQLite is sandboxed by iOS/Android and is never uploaded, but the database file itself is not extra-encrypted by AmpliFood.

## What lives where

| Data | Store | Encrypted by the OS? | Leaves the device? |
| --- | --- | --- | --- |
| Anthropic / OpenAI / xAI / Gemini API keys | `expo-secure-store` (iOS Keychain / Android Keystore). Web fallback: AsyncStorage in this browser only. | Yes on native | Only when **you** send a request to that provider |
| Selected provider + model ids | SecureStore (same path as keys) | Yes on native | No |
| Cached model lists | AsyncStorage (not a secret) | No (on-device) | No |
| Theme (`themeMode`) and AI Chef helper collapse | AsyncStorage | No (on-device) | No |
| Account profile: name, username, email, avatar, flavor preferences, recipes cooked | On-device SQLite `users` table | No extra encryption | No |
| Recipes, pantry, grocery, meal plans, parties, AI chat history, workouts, mood, lab panels | On-device SQLite (`fooddude.db`, a file name kept from before the rebrand so existing data carries over). On web: the same database in this browser's Origin Private File System. | No extra encryption | No, except when you ask AI Chef to use them in a prompt |

Secrets stay in SecureStore. Do not move API keys into SQLite.

**On the web build**, there is no Keychain. Keys are saved in this browser's `localStorage` for the AmpliFood site and are not encrypted at rest. Anyone with access to this browser profile can read them. Use Account → Clear on shared computers. Storage keys keep the `fooddude.` prefix from before the rebrand so saved keys carry over.

## Device permissions

AmpliFood asks for as little as possible. Each permission maps to one feature:

| Permission | Platform | Feature | When it's asked |
| --- | --- | --- | --- |
| Camera (`CAMERA` / `NSCameraUsageDescription`) | Android, iOS | Scanning a barcode in Pantry → Add / Edit item (`expo-camera`) | The first time you tap Scan |
| Photo library (`NSPhotoLibraryUsageDescription`) | iOS | Picking recipe screenshots or a recipe photo (`expo-image-picker`) | iOS shows the system photo picker; only the photos you pick are shared with the app |
| Internet | Android | AI provider calls, Open Food Facts lookups, recipe URL import | Granted at install (no prompt) |
| Vibrate | Android | Light haptics on some buttons | Granted at install (no prompt) |

On Android, photo picking goes through the system Photo Picker, which needs no permission, so AmpliFood declares **no** storage or media permissions. Shared images and text come in through the share sheet (`expo-share-intent`), which grants access only to the shared item.

Not requested, and actively blocked in the build so a library can't add them back: microphone (`RECORD_AUDIO`), `READ/WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO`, `READ_MEDIA_VISUAL_USER_SELECTED`, `ACCESS_MEDIA_LOCATION`, and `SYSTEM_ALERT_WINDOW`. There is no location, contacts, or Face ID use, and no "save to photo library" feature.

On the web build, the browser's file picker is used and no permission prompts appear.

## Bring Your Own Key

- AmpliFood does **not** ship a shared `EXPO_PUBLIC_` Gemini (or other) key. Those values are compiled into the JS bundle and would be public.
- You add a key in **Account → AI provider → Save key**.
- Remove it with **Account → Clear**. That deletes the key, selected models, and cached model lists for that provider on this device.
- Pantry, planner, grocery, and the recipe book keep working with no key.

## What leaves the device

AmpliFood has no account server. The only network calls that carry your content are ones you initiate:

1. **Your chosen LLM provider** (Anthropic, OpenAI, xAI, or Google Gemini). Chat, recipe import, image analysis, cost estimates, and recipe photos go to that provider with the key stored on this device. Flavor preferences and pantry context are included in those prompts when you use AI Chef.
2. **Open Food Facts** for barcode lookups. The request is a public product lookup, not your account profile.
3. **A recipe URL you import**, fetched so the app can parse the page.

Labs and other health-style notes stay on device. If you later ask an LLM about them, only the text you send in that prompt leaves the phone.

## How to remove keys and data

- **One provider key:** Account → AI provider → **Clear**.
- **Profile / flavor preferences:** Account → Edit Profile and clear the fields, then Save. Rows stay local in SQLite.
- **Everything:** uninstall the app, or clear the app’s storage. That removes SQLite, AsyncStorage, and Keychain/Keystore entries for AmpliFood.

## Schema note (flavor preferences)

Flavor preferences are a column on the local `users` table (`flavor_preferences`). New installs get it from `CREATE TABLE`. Existing Expo Go databases that already had `users` get the column from a versioned migration (`ALTER TABLE … ADD COLUMN`) plus a boot-time `PRAGMA table_info` check, so saving your profile does not require wiping the database.

## What this is not

- Not a medical device and not HIPAA-certified storage.
- Not full-disk encryption of recipes or pantry.
- Not a cloud backup. If you lose the phone and have no OS backup, the local database is gone.
- Not a AmpliFood-hosted account. Email in Account is a local label only.

## Further reading

- Account screen disclaimer (above AI provider settings)
- Account → Privacy
- [README.md](./README.md) — Privacy & Data
