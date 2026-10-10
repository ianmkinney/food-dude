import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getOwnerSessionToken } from '../platform/ownerSession';
import { partyMealOperations, partyMemberOperations, partyOperations } from '../database/operations';

const MEMBER_KEY_PREFIX = 'amplifood.party.live.member.';
const VERSION_KEY_PREFIX = 'amplifood.party.live.version.';

function apiBase() {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
        return `${window.location.origin}/api`;
    }
    const base = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://amplifood.vercel.app/api';
    return base.replace(/\/$/, '');
}

async function partyFetch(path, { method = 'POST', body, memberToken, sessionToken } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
    if (memberToken) headers['X-Party-Member-Token'] = memberToken;
    const res = await fetch(`${apiBase()}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.message || data.error || 'Party request failed');
        err.code = data.error;
        err.status = res.status;
        throw err;
    }
    return data;
}

export async function getStoredMemberToken(livePartyId) {
    if (!livePartyId) return null;
    return AsyncStorage.getItem(`${MEMBER_KEY_PREFIX}${livePartyId}`);
}

export async function setStoredMemberToken(livePartyId, token) {
    if (!livePartyId || !token) return;
    await AsyncStorage.setItem(`${MEMBER_KEY_PREFIX}${livePartyId}`, token);
}

export async function getStoredLiveVersion(livePartyId) {
    const raw = await AsyncStorage.getItem(`${VERSION_KEY_PREFIX}${livePartyId}`);
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
}

export async function setStoredLiveVersion(livePartyId, version) {
    await AsyncStorage.setItem(`${VERSION_KEY_PREFIX}${livePartyId}`, String(version));
}

export async function isLivePartySyncAvailable() {
    try {
        const res = await fetch(`${apiBase()}/party?action=changes_since`, { method: 'GET' });
        const data = await res.json().catch(() => ({}));
        return data.error !== 'misconfigured';
    } catch {
        return false;
    }
}

export async function createLiveParty({ name }) {
    const sessionToken = await getOwnerSessionToken();
    if (!sessionToken) throw new Error('Sign in on Account to create a live party.');
    const data = await partyFetch('/party?action=create', {
        body: { action: 'create', name },
        sessionToken,
    });
    await setStoredMemberToken(data.party.id, data.ownerMemberToken);
    await setStoredLiveVersion(data.party.id, data.party.version);
    return data;
}

export async function joinLiveParty({ inviteToken, displayName, email }) {
    const data = await partyFetch('/party?action=join', {
        body: { action: 'join', inviteToken, displayName, email },
    });
    await setStoredMemberToken(data.party.id, data.memberToken);
    await setStoredLiveVersion(data.party.id, data.party.version);
    return data;
}

export async function migrateLocalPartyToLive({ name, meals, members, imageBase64 }) {
    const sessionToken = await getOwnerSessionToken();
    if (!sessionToken) throw new Error('Sign in on Account to move this party to live sync.');
    const data = await partyFetch('/party?action=migrate', {
        body: { action: 'migrate', name, meals, members, imageBase64 },
        sessionToken,
    });
    await setStoredMemberToken(data.partyId, data.ownerMemberToken);
    await setStoredLiveVersion(data.partyId, data.party.version);
    return data;
}

export async function fetchLiveChanges({ livePartyId, sinceVersion, memberToken, sessionToken }) {
    const token = memberToken || (await getStoredMemberToken(livePartyId));
    const ownerToken = sessionToken || (await getOwnerSessionToken());
    const query = new URLSearchParams({
        action: 'changes_since',
        partyId: livePartyId,
        sinceVersion: String(sinceVersion ?? 0),
    });
    const headers = {};
    if (ownerToken) headers.Authorization = `Bearer ${ownerToken}`;
    if (token) headers['X-Party-Member-Token'] = token;
    const res = await fetch(`${apiBase()}/party?${query}`, { method: 'GET', headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.message || 'Could not sync party');
        err.code = data.error;
        throw err;
    }
    return data;
}

export async function pushLiveMeals({ livePartyId, meals, name, memberToken }) {
    const token = memberToken || (await getStoredMemberToken(livePartyId));
    const ownerToken = await getOwnerSessionToken();
    const body = { action: 'update_meals', partyId: livePartyId, meals, name };
    return partyFetch('/party?action=update_meals', {
        body,
        memberToken: token,
        sessionToken: ownerToken,
    });
}

export async function uploadLivePartyImage({ livePartyId, imageBase64 }) {
    const sessionToken = await getOwnerSessionToken();
    if (!sessionToken) throw new Error('Sign in to upload a party photo.');
    return partyFetch('/party?action=upload_image', {
        body: { action: 'upload_image', partyId: livePartyId, imageBase64 },
        sessionToken,
    });
}

export async function removeLiveMember({ livePartyId, memberId }) {
    const sessionToken = await getOwnerSessionToken();
    if (!sessionToken) throw new Error('Sign in as owner to remove members.');
    return partyFetch('/party?action=remove_member', {
        body: { action: 'remove_member', partyId: livePartyId, memberId },
        sessionToken,
    });
}

export async function applyLivePartySnapshot(localPartyId, snapshot) {
    if (!localPartyId || !snapshot) return;
    await partyOperations.update(localPartyId, { name: snapshot.name });
    await partyOperations.setLiveSyncFields(localPartyId, {
        livePartyId: snapshot.id,
        syncMode: 'live',
        liveInviteToken: snapshot.inviteToken,
        liveVersion: snapshot.version,
    });
    const members = (snapshot.members || []).map((m) => ({
        id: m.memberId,
        name: m.displayName,
        email: m.email,
        status: m.status === 'active' ? 'confirmed' : m.status,
        role:
            snapshot.ownerEmail && m.email && m.email.toLowerCase() === snapshot.ownerEmail.toLowerCase()
                ? 'owner'
                : 'member',
        joinedAt: m.joinedAt,
    }));
    await partyMemberOperations.syncFromDocument(localPartyId, members, snapshot.ownerEmail);
    const existingMeals = await partyMealOperations.getByPartyId(localPartyId);
    for (const meal of existingMeals) {
        await partyMealOperations.delete(meal.id);
    }
    for (const meal of snapshot.meals || []) {
        await partyMealOperations.create({
            partyId: localPartyId,
            name: meal.name,
            description: meal.description,
            recipeIds: meal.recipeIds || [],
            syncMealId: String(meal.id),
        });
    }
}

export async function attachOrCreateLocalLiveParty(snapshot) {
    let local = await partyOperations.getByLivePartyId(snapshot.id);
    if (!local) {
        const localId = await partyOperations.create({
            name: snapshot.name,
            partyUuid: snapshot.id,
            ownerEmail: snapshot.ownerEmail,
        });
        await partyOperations.setLiveSyncFields(localId, {
            livePartyId: snapshot.id,
            syncMode: 'live',
            liveInviteToken: snapshot.inviteToken,
            liveVersion: snapshot.version,
        });
        local = await partyOperations.getById(localId);
    }
    await applyLivePartySnapshot(local.id, snapshot);
    return local.id;
}

export async function pushLocalPartyMealsToLive(localParty) {
    if (!localParty?.live_party_id || localParty.sync_mode !== 'live') return null;
    const meals = await partyMealOperations.getByPartyId(localParty.id);
    const payload = meals.map((m) => ({
        name: m.name,
        description: m.description,
        recipeIds: m.recipeIds || [],
        id: m.sync_meal_id,
    }));
    const result = await pushLiveMeals({
        livePartyId: localParty.live_party_id,
        meals: payload,
        name: localParty.name,
    });
    await partyOperations.setLiveSyncFields(localParty.id, {
        liveVersion: result.version,
    });
    return result;
}

export function buildLiveInviteUrl(inviteToken) {
    const origin =
        Platform.OS === 'web' && typeof window !== 'undefined'
            ? window.location.origin
            : 'https://amplifood.vercel.app';
    return `${origin}/p/${inviteToken}`;
}
