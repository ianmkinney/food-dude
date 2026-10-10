import { Alert } from 'react-native';
import {
    assertMemberNotRemoved,
    buildJoinReceiptDocument,
    buildJoinReceiptLink,
    createJoiningMember,
    getStoredMemberId,
    setStoredMemberId,
} from './index';
import { applyPartyJoin } from './apply';
import { sendJoinReceiptToOwner, shareLink } from '../partyEmail';
import { partyOperations } from '../../database/operations';

export async function completePartyJoin({ doc, secret, displayName, currentUser }) {
    const storedId = await getStoredMemberId(doc.uuid);
    assertMemberNotRemoved(storedId, doc);

    const member = createJoiningMember(displayName);
    if (storedId && storedId !== member.id) {
        assertMemberNotRemoved(storedId, doc);
    }
    await setStoredMemberId(doc.uuid, member.id);

    const existing = await partyOperations.getByUuid(doc.uuid);
    const { partyId } = await applyPartyJoin(doc, member, {
        syncSecret: secret,
        createdBy: currentUser?.user_id,
        localPartyId: existing?.id,
    });

    const receiptDoc = buildJoinReceiptDocument({
        partyUuid: doc.uuid,
        partyName: doc.name,
        version: doc.version,
        member,
        removedMemberIds: doc.removedMemberIds || [],
    });
    const receiptLink = await buildJoinReceiptLink(receiptDoc, secret);
    const sendResult = await sendJoinReceiptToOwner({
        ownerEmail: doc.ownerEmail,
        partyName: doc.name,
        memberName: member.name,
        receiptLink,
        partyUuid: doc.uuid,
        version: doc.version,
    });

    if (!sendResult.ok) {
        await shareLink({
            title: `Joined ${doc.name}`,
            message: `Send this join receipt to the party owner so they can confirm you on the member list:`,
            url: receiptLink,
        });
        Alert.alert(
            'Share join receipt',
            doc.ownerEmail
                ? 'We could not email the owner automatically. Share the receipt link with them.'
                : 'Share the receipt link with the party owner so your name appears on their member list.'
        );
    }

    return { partyId, receiptLink };
}
