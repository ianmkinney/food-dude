import { Linking, Platform, Share } from 'react-native';
import { getApiBaseUrl } from '../config/api';
import { getOwnerSessionToken } from '../platform/ownerSession';

const MSG = {
    unauthorized: 'Sign in under Account → Owner sign-in to send email from AmpliFood.',
    rate_limited: 'Too many emails sent. Wait a moment and try again.',
    bad_request: 'Could not send that email.',
    upstream_failed: 'Email could not be sent. Try again or use your email app.',
    platform_disabled: 'Email sending is not configured on the server.',
    misconfigured: 'Email sending is not configured on the server.',
};

/**
 * @param {object} params
 * @param {'invite' | 'member_update' | 'broadcast' | 'join_receipt'} params.kind
 */
export async function sendPartyEmailViaApi(params) {
    const token = await getOwnerSessionToken();
    if (!token) {
        return { ok: false, reason: 'no_session', message: MSG.unauthorized };
    }
    const response = await fetch(`${getApiBaseUrl()}/party/email`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(params),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const code = body?.error || 'upstream_failed';
        return {
            ok: false,
            reason: code,
            message: MSG[code] || body?.message || MSG.upstream_failed,
            status: response.status,
        };
    }
    return { ok: true };
}

export async function openMailtoFallback({ to, subject, body }) {
    const email = Array.isArray(to) ? to[0] : to;
    const url = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if (Platform.OS === 'web') {
        window.location.href = url;
        return true;
    }
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
        await Linking.openURL(url);
        return true;
    }
    return false;
}

export async function shareLink({ title, message, url }) {
    try {
        if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
            await navigator.share({ title, text: message, url });
            return true;
        }
        await Share.share({
            title,
            message: Platform.OS === 'ios' ? message : `${message}\n${url}`,
            url: Platform.OS === 'ios' ? url : undefined,
        });
        return true;
    } catch {
        return false;
    }
}

export function buildInviteMail({ partyName, actorName, shareLink, appName = 'AmpliFood' }) {
    const subject = `Join my party "${partyName}" on ${appName}`;
    const body = `You're invited to "${partyName}" on ${appName}.

Open this link to join (the party data stays in the link — nothing is stored on our servers):

${shareLink}`;
    return { subject, body };
}

export function buildJoinReceiptMail({ partyName, memberName, shareLink }) {
    const subject = `${memberName} joined "${partyName}"`;
    const body = `${memberName} joined your party "${partyName}".

Open this receipt link on your device to confirm them on your member list:

${shareLink}

Membership syncs via links and email only; nothing is stored on our servers.`;
    return { subject, body };
}

export function buildMemberUpdateMail({ partyName, actorName, shareLink }) {
    const subject = `Party update for "${partyName}"`;
    const body = `${actorName} suggested changes for "${partyName}".

Review: ${shareLink}`;
    return { subject, body };
}

export function buildBroadcastMail({ partyName, actorName, shareLink, version }) {
    const subject = `Updated party "${partyName}" (v${version})`;
    const body = `${actorName} shared a new version of "${partyName}".

Open to sync on your device:

${shareLink}`;
    return { subject, body };
}

export async function sendJoinReceiptToOwner({
    ownerEmail,
    partyName,
    memberName,
    receiptLink,
    partyUuid,
    version,
}) {
    if (!ownerEmail) {
        return { ok: false, reason: 'no_owner_email', receiptLink };
    }
    const apiResult = await sendPartyEmailViaApi({
        kind: 'join_receipt',
        to: [ownerEmail],
        ownerEmail,
        partyMembers: [{ email: ownerEmail, name: 'Owner' }],
        partyName,
        shareLink: receiptLink,
        actorName: memberName,
        version,
        partyUuid,
    });
    if (apiResult.ok) return { ok: true };
    const mail = buildJoinReceiptMail({ partyName, memberName, shareLink: receiptLink });
    const mailed = await openMailtoFallback({ to: [ownerEmail], subject: mail.subject, body: mail.body });
    return { ok: mailed, reason: apiResult.reason, receiptLink };
}
