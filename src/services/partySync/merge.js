/**
 * Decide how an imported document should apply to the local party.
 * @returns {'ignore' | 'apply' | 'review'}
 */
export function resolveMergeAction(localDoc, incomingDoc, viewerEmail) {
    const viewer = String(viewerEmail || '').toLowerCase();
    const isOwner = viewer && viewer === String(localDoc?.ownerEmail || incomingDoc?.ownerEmail || '').toLowerCase();

    if (!localDoc) {
        return 'apply';
    }
    if (incomingDoc.uuid !== localDoc.uuid) {
        return 'apply';
    }
    if (incomingDoc.version > localDoc.version) {
        return 'apply';
    }
    if (incomingDoc.version < localDoc.version) {
        return 'ignore';
    }
    if (incomingDoc.proposal && isOwner) {
        return 'review';
    }
    if (incomingDoc.updatedAt > localDoc.updatedAt && isOwner) {
        return 'review';
    }
    if (incomingDoc.updatedAt <= localDoc.updatedAt) {
        return 'ignore';
    }
    return isOwner ? 'review' : 'ignore';
}
