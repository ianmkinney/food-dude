import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Tiny in-memory cache for tab data. Screens render the cached value straight
 * away, refetch quietly on focus, and only show a skeleton when there is no
 * cached value and the fetch is slower than SKELETON_DELAY.
 */
export const SKELETON_DELAY = 300;

const entries = new Map();

function entry(key) {
    let e = entries.get(key);
    if (!e) {
        e = { data: undefined, has: false, inflight: null, listeners: new Set() };
        entries.set(key, e);
    }
    return e;
}

function emit(e) {
    e.listeners.forEach((fn) => fn(e.data));
}

export function getCached(key) {
    const e = entries.get(key);
    return e && e.has ? e.data : undefined;
}

export function setCached(key, updater) {
    const e = entry(key);
    e.data = typeof updater === 'function' ? updater(e.data) : updater;
    e.has = true;
    emit(e);
}

export function fetchQuery(key, fetcher) {
    const e = entry(key);
    if (e.inflight) return e.inflight;
    e.inflight = Promise.resolve()
        .then(fetcher)
        .then((data) => {
            e.data = data;
            e.has = true;
            emit(e);
            return data;
        })
        .finally(() => {
            e.inflight = null;
        });
    return e.inflight;
}

export function prefetchQuery(key, fetcher) {
    if (entries.get(key)?.has) return Promise.resolve(getCached(key));
    return fetchQuery(key, fetcher).catch(() => undefined);
}

/** Refetch every mounted query whose key starts with `prefix`; drop the rest. */
export function invalidateQueries(prefix) {
    entries.forEach((e, key) => {
        if (!key.startsWith(prefix)) return;
        if (e.listeners.size === 0) entries.delete(key);
        else e.listeners.forEach((fn) => fn(e.data, true));
    });
}

/**
 * Returns `{ data, showSkeleton, refresh, setData }`. `refresh` resolves to the
 * fresh data and rejects on error so callers can decide how to surface it.
 */
export function useQuery(key, fetcher, { refetchOnFocus = true } = {}) {
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;
    const [data, setData] = useState(() => getCached(key));
    const [showSkeleton, setShowSkeleton] = useState(false);

    const refresh = useCallback(() => fetchQuery(key, () => fetcherRef.current()), [key]);

    useEffect(() => {
        const e = entry(key);
        setData(e.has ? e.data : undefined);
        const onChange = (next, invalidated) => {
            if (invalidated) refresh().catch(() => undefined);
            else setData(next);
        };
        e.listeners.add(onChange);
        return () => e.listeners.delete(onChange);
    }, [key, refresh]);

    // Covers the first load and key changes; focus refetches are handled below.
    useEffect(() => {
        let timer;
        if (!entries.get(key)?.has) {
            timer = setTimeout(() => setShowSkeleton(true), SKELETON_DELAY);
        }
        refresh()
            .catch(() => undefined)
            .finally(() => {
                clearTimeout(timer);
                setShowSkeleton(false);
            });
        return () => clearTimeout(timer);
    }, [key, refresh]);

    const mounted = useRef(false);
    useFocusEffect(
        useCallback(() => {
            if (!refetchOnFocus) return;
            if (!mounted.current) {
                mounted.current = true;
                return;
            }
            refresh().catch(() => undefined);
        }, [refresh, refetchOnFocus])
    );

    const update = useCallback((updater) => setCached(key, updater), [key]);

    return { data, showSkeleton, refresh, setData: update };
}
