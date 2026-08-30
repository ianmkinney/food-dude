export const USER_SAFETY_TITLE = 'Bring Your Own Key — on-device storage';

export const USER_SAFETY_SUMMARY =
    'Your data stays on this device. API keys are stored in the OS encrypted keychain. Recipes, pantry, and preferences live in a local database that never leaves your phone.';

export const USER_SAFETY_DETAILS = [
    'Food Dude is a Bring Your Own Key (BYOK) app. There is no Food Dude server for keys or account data.',
    'Keys never leave the device to Food Dude. Requests go only to the provider you choose (Anthropic, OpenAI, xAI, or Gemini).',
    'Secrets use iOS Keychain / Android Keystore via expo-secure-store. On web, keys stay in this browser only.',
    'Profile, flavor preferences, recipes, and pantry live in on-device SQLite. Theme and UI prefs use on-device AsyncStorage.',
    'The local database is sandboxed on your phone; it is not uploaded. SQLite itself is not extra-encrypted by the app.',
].join('\n\n');
