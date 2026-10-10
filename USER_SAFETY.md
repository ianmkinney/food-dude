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
| Recipes, pantry, grocery, meal plans, parties, AI chat history | On-device SQLite (`fooddude.db`, a file name kept from before the rebrand so existing data carries over). On web: the same database in this browser's Origin Private File System. | No extra encryption | No, except when you ask AI Chef to use them in a prompt |

Secrets stay in SecureStore. Do not move API keys into SQLite.

**On the web build**, there is no Keychain. Keys are saved in this browser's `localStorage` for the AmpliFood site and are not encrypted at rest. Anyone with access to this browser profile can read them. Use Account → Clear on shared computers. Storage keys keep the `fooddude.` prefix from before the rebrand so saved keys carry over.

## Device permissions

AmpliFood asks for as little as possible. Each permission maps to one feature:

| Permission | Platform | Feature | When it's asked |
| --- | --- | --- | --- |
| Camera (`CAMERA` / `NSCameraUsageDescription`) | Android, iOS | Scanning a barcode in Pantry → Add / Edit item (`expo-camera`), and taking a photo of a dish when you choose **Use my photo → Take a photo** (`expo-image-picker`) | The first time you tap Scan or Take a photo |
| Photo library (`NSPhotoLibraryUsageDescription`) | iOS | Picking recipe screenshots or a recipe photo (`expo-image-picker`) | iOS shows the system photo picker; only the photos you pick are shared with the app |
| Microphone (`RECORD_AUDIO` / `NSMicrophoneUsageDescription`) | Android, iOS | Push-to-talk with Ampi (`expo-speech-recognition`): listens only while you hold the mic button; on-device recognition only | The first time you hold the mic; Android shows a short rationale first |
| Speech recognition (`NSSpeechRecognitionUsageDescription`) | iOS | Turning what you say into a message for Ampi; on-device recognition only | With the microphone prompt, when you hold the mic |
| Modify audio settings (`MODIFY_AUDIO_SETTINGS`) | Android | Playing Ampi's voice (`expo-speech` on-device TTS) | Granted at install (no prompt) |
| Internet | Android | AI provider calls, Open Food Facts lookups, recipe URL import | Granted at install (no prompt) |
| Vibrate | Android | Light haptics on some buttons | Granted at install (no prompt) |

On Android, photo picking goes through the system Photo Picker, which needs no permission, so AmpliFood declares **no** storage or media permissions. Shared images and text come in through the share sheet (`expo-share-intent`), which grants access only to the shared item.

**Microphone for Ampi.** It is only requested when you hold the mic. Speech recognition is on-device only where the platform supports it; there is no cloud speech fallback in the app. Audio is not sent to AmpliFood. Update Play Data Safety and the App Store privacy label ("Audio data" for app functionality, not collected by AmpliFood) before shipping.

Not requested, and actively blocked in the build so a library can't add them back: `READ/WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO`, `READ_MEDIA_VISUAL_USER_SELECTED`, `ACCESS_MEDIA_LOCATION`, and `SYSTEM_ALERT_WINDOW`. There is no location, contacts, or Face ID use, and no "save to photo library" feature.

On the web build, the browser's file picker is used for photos; the browser asks for the camera when you scan or take a photo. The mic appears only when on-device speech recognition is available in that browser.

## Allergies, diet and AI (consumer health data)

- Allergies and diet needs are optional (onboarding step "Allergies & diet (optional)", or Account → Allergies & diet). They stay on this device and are never sold or used for ads.
- They are sent to your AI provider **only** if you tick "Also include my allergies & diet needs" (onboarding AI consent, or Account → AI & privacy). The on-device allergen check runs either way.
- AI use itself needs a per-provider "Allow" (Apple 5.1.2(i)), revocable in Account → AI & privacy.

## Ampi voice

- **On-device TTS only at launch:** replies use the device's built-in text-to-speech (`expo-speech`). Nothing leaves the device.
- Every voice output also shows its text, can be muted (the setting persists), and turns off automatically while VoiceOver/TalkBack is on (native only).
- Scripted onboarding lines are read with the phone voice and always shown as captions.

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

## How to remove keys and data

- **One provider key:** Account → AI provider → **Clear**.
- **Profile / flavor preferences:** Account → Edit Profile and clear the fields, then Save. Rows stay local in SQLite.
- **Everything on this device:** uninstall the app (native) or clear site data for amplifood.vercel.app (web). There is no cloud copy to delete.

## Reporting AI output

Use **Report** on AI Chef or Ampi replies if something looks unsafe or wrong. Reports stay on the device today (a future build may offer optional upload).
