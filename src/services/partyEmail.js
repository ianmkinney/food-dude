import { Linking, Platform } from 'react-native';
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
 * @param {'invite' | 'member_update' | 'broadcast'} params.kind
 * @param {string[]} params.to
 * @param {{ email: string, name?: string }[]} params.partyMembers
 * @param {string} params.partyName
 * @param {string} params.shareLink
 * @param {string} [params.actorName]
 * @param {string} [params.note]
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

export function buildInviteMail({ partyName, actorName, shareLink, appName = 'AmpliFood' }) {
    const subject = `Join my party "${partyName}" on ${appName}`;
    const body = `Hi!

${actorName} invited you to join the party "${partyName}" on ${appName}.

Open this link to import the party on your device (your browser will not send the link to our servers):

${shareLink}

Party updates travel by email; nothing is stored on our servers.

Happy cooking!
${actorName}`;
    return { subject, body };
}

export function buildMemberUpdateMail({ partyName, actorName, shareLink }) {
    const subject = `Party update for "${partyName}"`;
    const body = `${actorName} suggested changes for "${partyName}".

Review the update here:

${shareLink}

Party updates travel by email; nothing is stored on our servers.`;
    return { subject, body };
}

export function buildBroadcastMail({ partyName, actorName, shareLink, version }) {
    const subject = `Updated party "${partyName}" (v${version})`;
    const body = `${actorName} shared a new version of "${partyName}".

Open to sync on your device:

${shareLink}

Party updates travel by email; nothing is stored on our servers.`;
    return { subject, body };
}
