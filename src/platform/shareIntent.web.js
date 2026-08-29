import React from 'react';

export function ShareIntentProvider({ children }) {
  return children;
}

export function useShareIntent() {
  return {
    hasShareIntent: false,
    shareIntent: null,
    resetShareIntent: () => {},
  };
}
