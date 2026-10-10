import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

// One subscription for the whole app. On web the media query is read
// synchronously so the very first frame already honours the setting.
const listeners = new Set();
const media =
    Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
let reduceMotion = media ? media.matches : false;
let started = false;

const set = (value) => {
    const next = Boolean(value);
    if (next === reduceMotion) return;
    reduceMotion = next;
    listeners.forEach((listener) => listener());
};

const start = () => {
    if (started) return;
    started = true;
    if (media) {
        media.addEventListener?.('change', (event) => set(event.matches));
        return;
    }
    AccessibilityInfo.isReduceMotionEnabled?.().then(set).catch(() => {});
    AccessibilityInfo.addEventListener?.('reduceMotionChanged', set);
};

const subscribe = (listener) => {
    start();
    listeners.add(listener);
    return () => listeners.delete(listener);
};

const getSnapshot = () => reduceMotion;

export const isReducedMotion = () => {
    start();
    return reduceMotion;
};

export const useReducedMotion = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

export default useReducedMotion;
