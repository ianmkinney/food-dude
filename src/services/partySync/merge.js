/**
 * Decide how an imported document should apply to the local party.
 * @returns {'ignore' | 'apply' | 'review' | 'join' | 'join_receipt'}
 */
export function resolveMergeAction(localDoc, incomingDoc, viewerEmail) {
    const intent = incomingDoc?.intent;

    if (intent === 'join_receipt') {
        return 'join_receipt';
    }

    if (intent === 'join') {
        return 'join';
    }

    const viewer = String(viewerEmail || '').toLowerCase();
    const isOwner =
        viewer &&
        viewer === String(localDoc?.ownerEmail || incomingDoc?.ownerEmail || '').toLowerCase();

    if (!localDoc) {
        return intent === 'join' ? 'join' : 'apply';
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
