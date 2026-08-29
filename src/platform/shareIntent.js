import React from 'react';

function FallbackProvider({ children }) {
  return children;
}

function fallbackUseShareIntent() {
  return {
    hasShareIntent: false,
    shareIntent: null,
    resetShareIntent: () => {},
  };
}

let ShareIntentProvider = FallbackProvider;
let useShareIntent = fallbackUseShareIntent;

try {
  const native = require('expo-share-intent');
  if (native?.ShareIntentProvider) {
    ShareIntentProvider = native.ShareIntentProvider;
  }
  if (native?.useShareIntent) {
    useShareIntent = native.useShareIntent;
  }
} catch {
  // Expo Go and builds without the native share-intent module.
}

export { ShareIntentProvider, useShareIntent };
