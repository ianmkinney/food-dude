import { useSyncExternalStore } from 'react';

// Whether a chat composer is focused. On the web the tab bar hides while it
// is, like Messages, so the composer can sit right on top of the keyboard.
let focused = false;
const listeners = new Set<() => void>();

export function setComposerFocused(next: boolean): void {
    if (focused === next) return;
    focused = next;
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function useComposerFocused(): boolean {
    return useSyncExternalStore(subscribe, () => focused, () => false);
}
