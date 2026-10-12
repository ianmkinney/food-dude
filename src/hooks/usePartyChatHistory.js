import { useCallback, useEffect, useRef, useState } from 'react';
import {
    fetchAllPartyChatHistory,
    mergeServerPartyChatWithLocal,
    setStoredChatSince,
} from '../services/partyLiveSync';

/**
 * Load full party chat history when the chat panel opens.
 * @param {string | null | undefined} livePartyId
 * @param {(updater: (prev: object[]) => object[]) => void} setMessages
 */
export function usePartyChatHistory(livePartyId, setMessages) {
    const [loadState, setLoadState] = useState('idle');
    const [loadError, setLoadError] = useState(null);
    const loadGenRef = useRef(0);

    const reload = useCallback(async () => {
        if (!livePartyId) {
            setLoadState('idle');
            setLoadError(null);
            return;
        }
        const gen = loadGenRef.current + 1;
        loadGenRef.current = gen;
        setLoadState('loading');
        setLoadError(null);
        try {
            const { messages, latestCreatedAt } = await fetchAllPartyChatHistory(livePartyId);
            if (loadGenRef.current !== gen) return;
            if (latestCreatedAt > 0) await setStoredChatSince(livePartyId, latestCreatedAt);
            setMessages((prev) => mergeServerPartyChatWithLocal(messages, prev));
            setLoadState('ready');
        } catch (error) {
            if (loadGenRef.current !== gen) return;
            setLoadError(error?.message || 'Could not load chat history');
            setLoadState('error');
        }
    }, [livePartyId, setMessages]);

    useEffect(() => {
        reload();
    }, [reload]);

    return { loadState, loadError, reload };
}
