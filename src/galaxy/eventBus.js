/**
 * A tiny in-process event bus.
 *
 * The Bridge needs to know the moment a signal is written so it can launch a
 * craft, but the writer is usually a screen several navigators away. Rather
 * than thread callbacks through navigation params, writers announce here and
 * the Bridge subscribes.
 *
 * This is memory-only and single-process. SQLite remains the durable record;
 * the bus only exists so the UI can react without polling.
 */

export const EVENTS = {
    SIGNAL_CREATED: 'signal:created',
    SIGNALS_SEEN: 'signals:seen',
    PLANETS_CHANGED: 'planets:changed',
    SETTINGS_CHANGED: 'settings:changed',
};

const listeners = new Map();

/**
 * Subscribe to an event. Returns an unsubscribe function, which is what you
 * want to return from a `useEffect`.
 */
export function on(event, listener) {
    if (typeof listener !== 'function') return () => {};
    let set = listeners.get(event);
    if (!set) {
        set = new Set();
        listeners.set(event, set);
    }
    set.add(listener);
    return () => off(event, listener);
}

export function off(event, listener) {
    const set = listeners.get(event);
    if (!set) return;
    set.delete(listener);
    if (set.size === 0) listeners.delete(event);
}

/**
 * Notify every subscriber. One listener throwing must not stop the others or
 * bubble back into the caller's save path, so each is isolated.
 */
export function emit(event, payload) {
    const set = listeners.get(event);
    if (!set || set.size === 0) return;
    for (const listener of Array.from(set)) {
        try {
            listener(payload);
        } catch (error) {
            console.warn(`[eventBus] listener for "${event}" threw:`, error);
        }
    }
}

export function once(event, listener) {
    const unsubscribe = on(event, (payload) => {
        unsubscribe();
        listener(payload);
    });
    return unsubscribe;
}

export function clearAll() {
    listeners.clear();
}

export default { EVENTS, on, off, once, emit, clearAll };
