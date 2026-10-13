import AsyncStorage from '@react-native-async-storage/async-storage';
import { pantryOperations } from '../database/operations';
import { getOwnerSessionToken } from '../platform/ownerSession';
import { getStoredMemberToken, ensurePartyMemberToken } from './partyLiveSync';
import { normalizePantrySnapshotItems } from '../../api/_lib/partyPantryShare.js';
import { buildPantryByMemberFromMembersList } from '../../api/_lib/partyPantryMatch.js';
import { isPartyPantryMealPrompt } from '../../api/_lib/partyPantryPrompt.js';

export { isPartyPantryMealPrompt };

const PROMPT_KEY_PREFIX = 'amplifood.party.pantrySharePromptSeen.';

function apiBase() {
    if (typeof window !== 'undefined' && window.location?.origin) {
        return `${window.location.origin}/api`;
    }
    const base = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://amplifood.vercel.app/api';
    return base.replace(/\/$/, '');
}

async function partyFetch(path, body) {
    const memberToken = body?.livePartyId ? await getStoredMemberToken(body.livePartyId) : null;
    const sessionToken = await getOwnerSessionToken();
    const headers = { 'Content-Type': 'application/json' };
    if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
    if (memberToken) headers['X-Party-Member-Token'] = memberToken;
    const res = await fetch(`${apiBase()}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.message || data.error || 'Party pantry request failed');
        err.code = data.error;
        throw err;
    }
    return data;
}

export async function buildLocalPantrySnapshotItems() {
    const rows = await pantryOperations.getAll();
    return normalizePantrySnapshotItems(
        (rows || []).map((row) => ({
            name: row.name,
            quantity: row.quantity,
            unit: row.unit,
            amountPct: row.amount_pct,
            freshnessPct: row.freshness_pct,
            expirationDate: row.expiration_date,
        }))
    );
}

export async function setPartyPantryShare(livePartyId, enabled) {
    await ensurePartyMemberToken(livePartyId);
    const data = await partyFetch('/party?action=set_pantry_share', {
        action: 'set_pantry_share',
        partyId: livePartyId,
        enabled: Boolean(enabled),
    });
    if (enabled) {
        await pushPartyPantrySnapshot(livePartyId);
    }
    return data;
}

export async function pushPartyPantrySnapshot(livePartyId) {
    await ensurePartyMemberToken(livePartyId);
    const items = await buildLocalPantrySnapshotItems();
    return partyFetch('/party?action=update_pantry_snapshot', {
        action: 'update_pantry_snapshot',
        partyId: livePartyId,
        items,
    });
}

export function pantryContextFromPartySnapshot(snapshot) {
    return buildPantryByMemberFromMembersList(snapshot?.members || []);
}

export async function getPantrySharePromptSeen(livePartyId) {
    return (await AsyncStorage.getItem(`${PROMPT_KEY_PREFIX}${livePartyId}`)) === '1';
}

export async function setPantrySharePromptSeen(livePartyId) {
    await AsyncStorage.setItem(`${PROMPT_KEY_PREFIX}${livePartyId}`, '1');
}
