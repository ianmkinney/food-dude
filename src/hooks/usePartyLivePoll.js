import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
    fetchLiveChanges,
    getStoredLiveVersion,
    setStoredLiveVersion,
} from '../services/partyLiveSync';

const FOCUS_MS = 5000;
const BACKGROUND_MS = 30000;

/**
 * Poll Neon party changes while the Party screen is focused.
 * @param {{ livePartyId?: string | null, enabled?: boolean, onSnapshot: (party: object) => void }} options
 */
export function usePartyLivePoll({ livePartyId, enabled = true, onSnapshot }) {
    const timerRef = useRef(null);
    const focusedRef = useRef(false);
    const appActiveRef = useRef(true);

    const pollOnce = useCallback(async () => {
        if (!livePartyId || !enabled) return;
        try {
            const since = await getStoredLiveVersion(livePartyId);
            const result = await fetchLiveChanges({ livePartyId, sinceVersion: since });
            if (result.changed && result.party) {
                await setStoredLiveVersion(livePartyId, result.version);
                onSnapshot?.(result.party);
            }
        } catch (error) {
            console.warn('[party live poll]', error?.message || error);
        }
    }, [livePartyId, enabled, onSnapshot]);

    const schedule = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        const delay = focusedRef.current && appActiveRef.current ? FOCUS_MS : BACKGROUND_MS;
        timerRef.current = setTimeout(async () => {
            await pollOnce();
            schedule();
        }, delay);
    }, [pollOnce]);

    useFocusEffect(
        useCallback(() => {
            focusedRef.current = true;
            pollOnce();
            schedule();
            return () => {
                focusedRef.current = false;
                schedule();
            };
        }, [pollOnce, schedule])
    );

    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            appActiveRef.current = state === 'active';
            schedule();
        });
        return () => {
            sub.remove();
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [schedule]);
}
