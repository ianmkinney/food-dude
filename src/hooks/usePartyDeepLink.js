import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
    applyJoinReceipt,
    decodeSignedPartyPayload,
    parsePartyHash,
    resolveMergeAction,
    assertMemberNotRemoved,
    getStoredMemberId,
} from '../services/partySync';
import { buildPartyExportDocument } from '../services/partySync/model';
import { applyPartyDocument } from '../services/partySync/apply';
import { partyMealOperations, partyMemberOperations, partyOperations } from '../database/operations';

function readWebHash() {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return '';
    return window.location.hash || '';
}

function clearWebHash() {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const url = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, '', url);
}

/**
 * @param {{ viewerEmail?: string, onImported?: (partyId: number) => void }} options
 */
export function usePartyDeepLink({ viewerEmail, onImported }) {
    const [pendingReview, setPendingReview] = useState(null);
    const [pendingJoin, setPendingJoin] = useState(null);
    const [importSummary, setImportSummary] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const parts = parsePartyHash(readWebHash());
            if (!parts) return;
            try {
                const doc = await decodeSignedPartyPayload({
                    p: parts.p,
                    sig: parts.sig,
                    secret: parts.secret,
                });
                const storedMemberId = await getStoredMemberId(doc.uuid);
                assertMemberNotRemoved(storedMemberId, doc);

                const local = await partyOperations.getByUuid(doc.uuid);
                let localDoc = null;
                if (local) {
                    const members = await partyMemberOperations.getByPartyId(local.id);
                    const meals = await partyMealOperations.getByPartyId(local.id);
                    localDoc = buildPartyExportDocument(local, members, meals);
                }
                const action = resolveMergeAction(localDoc, doc, viewerEmail);
                clearWebHash();
                if (cancelled) return;

                if (action === 'join') {
                    setPendingJoin({ doc, secret: parts.secret, localPartyId: local?.id });
                    return;
                }

                if (action === 'join_receipt') {
                    const result = await applyJoinReceipt(doc, { syncSecret: parts.secret });
                    setImportSummary(`${doc.member?.name || 'Someone'} is now on your member list.`);
                    onImported?.(result.partyId);
                    return;
                }

                if (action === 'ignore') {
                    setImportSummary('That party link is older than your copy. Nothing changed.');
                    return;
                }
                if (action === 'review') {
                    setPendingReview({ doc, secret: parts.secret, localPartyId: local?.id });
                    return;
                }
                const result = await applyPartyDocument(doc, {
                    localPartyId: local?.id,
                    syncSecret: parts.secret,
                });
                setImportSummary(`Party "${doc.name}" synced (v${doc.version}).`);
                onImported?.(result.partyId);
            } catch (error) {
                if (!cancelled) {
                    setImportSummary(error?.message || 'Could not import party link.');
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [viewerEmail, onImported]);

    return {
        pendingReview,
        clearPendingReview: () => setPendingReview(null),
        pendingJoin,
        clearPendingJoin: () => setPendingJoin(null),
        importSummary,
        clearImportSummary: () => setImportSummary(null),
    };
}
