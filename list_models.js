/**
 * Model listing moved in-app.
 *
 * Add a Claude, OpenAI, Grok, or Gemini key in Account. The app fetches
 * that provider's models with the on-device key (SecureStore) and never
 * reads EXPO_PUBLIC_ provider secrets from .env.
 */
console.log('List models in the Food Dude app: Account → AI provider → Refresh list.');
console.log('Keys stay on the device. There is no shared EXPO_PUBLIC Gemini key.');
