import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
    fetchLiveChanges,
    fetchLivePartySnapshot,
    getStoredChatSince,
    getStoredLiveVersion,
    setStoredChatSince,
    setStoredLiveVersion,
} from '../services/partyLiveSync';

const FOCUS_MS = 5000;
const BACKGROUND_MS = 30000;

/**
 * Poll Neon party changes while the Party screen is focused.
 * @param {{
 *   livePartyId?: string | null,
 *   enabled?: boolean,
 *   onSnapshot: (party: object) => void,
 *   onChatMessages?: (messages: object[], latestCreatedAt: number) => void,
 * }} options
 */
export function usePartyLivePoll({ livePartyId, enabled = true, onSnapshot, onChatMessages }) {
    const timerRef = useRef(null);
    const focusedRef = useRef(false);
    const appActiveRef = useRef(true);

    const pollOnce = useCallback(
        async (forceFull = false) => {
            if (!livePartyId || !enabled) return;
            try {
                const since = await getStoredLiveVersion(livePartyId);
                const sinceChat = await getStoredChatSince(livePartyId);
                if (forceFull) {
                    const party = await fetchLivePartySnapshot(livePartyId);
                    if (party?.version != null) {
                        await setStoredLiveVersion(livePartyId, party.version);
                    }
                    onSnapshot?.(party);
                    const chatBootstrap = await fetchLiveChanges({
                        livePartyId,
                        sinceVersion: party?.version ?? since,
                        sinceChatMs: 0,
                    });
                    const bootstrapMsgs = chatBootstrap.chat?.messages ?? [];
                    const latestBootstrap = chatBootstrap.chat?.latestCreatedAt ?? 0;
                    if (latestBootstrap > 0) await setStoredChatSince(livePartyId, latestBootstrap);
                    if (bootstrapMsgs.length) {
                        onChatMessages?.(bootstrapMsgs, latestBootstrap);
                    }
                    import('../sync/syncEvents')
                        .then(({ emitSyncData }) => emitSyncData({ kind: 'party' }))
                        .catch(() => undefined);
                    return;
                }
                const result = await fetchLiveChanges({ livePartyId, sinceVersion: since, sinceChatMs: sinceChat });
                const incoming = result.chat?.messages ?? [];
                const latest = result.chat?.latestCreatedAt ?? sinceChat;
                if (incoming.length) {
                    if (latest > sinceChat) await setStoredChatSince(livePartyId, latest);
                    onChatMessages?.(incoming, latest);
                }
                if (Number(result.version) > since) {
                    const party =
                        result.changed && result.party
                            ? result.party
                            : await fetchLivePartySnapshot(livePartyId);
                    await setStoredLiveVersion(livePartyId, result.version ?? party.version);
                    onSnapshot?.(party);
                    import('../sync/syncEvents')
                        .then(({ emitSyncData }) => emitSyncData({ kind: 'party' }))
                        .catch(() => undefined);
                }
            } catch (error) {
                console.warn('[party live poll]', error?.message || error);
            }
        },
        [livePartyId, enabled, onSnapshot, onChatMessages]
    );

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
            pollOnce(true);
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
