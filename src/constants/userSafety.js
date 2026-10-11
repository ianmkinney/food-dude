export const USER_SAFETY_TITLE = 'Bring Your Own Key — on-device storage';

export const USER_SAFETY_SUMMARY =
    'API keys stay on this device (encrypted keychain or browser storage). Recipes and pantry live locally; optional Google sign-in can encrypt-sync them across browsers. Parties and manual backups are stored online when you use those features.';

export const USER_SAFETY_DETAILS = [
    'AmpliFood is a Bring Your Own Key (BYOK) app for AI. Google sign-in enables parties, optional encrypted sync, and backups — never your API keys.',
    'Keys never leave the device to AmpliFood. Requests go only to the provider you choose (Anthropic, OpenAI, xAI, or Gemini).',
    'Secrets use iOS Keychain / Android Keystore via expo-secure-store. On web, keys stay in this browser only.',
    'Profile, flavor preferences, recipes, and pantry live in on-device SQLite. Theme and UI prefs use on-device AsyncStorage.',
    'The local database is sandboxed on your phone; it is not uploaded. SQLite itself is not extra-encrypted by the app.',
    'Permissions: the camera when you scan a barcode or take a photo of a dish, and the microphone only when you tap Talk to speak to Ampi (on-device speech recognition where available). Photos from your library come through the system picker, so AmpliFood never gets your whole library. No location or storage access.',
].join('\n\n');
