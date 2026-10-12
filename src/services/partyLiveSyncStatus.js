import { partyOperations } from '../database/operations';
import {
    applyLivePartySnapshot,
    pushLocalPartyMealsToLive,
    renameLiveParty,
    uploadLivePartyImage,
} from './partyLiveSync';

/** @typedef {'idle' | 'saving' | 'saved' | 'offline'} PartySyncUiState */

const listeners = new Map();
const retryQueue = [];
let flushTimer = null;

function keyFor(localPartyId) {
    return String(localPartyId);
}

export function getPartySyncUiState(localPartyId) {
    return listeners.get(keyFor(localPartyId))?.state || 'idle';
}

export function subscribePartySyncUiState(localPartyId, cb) {
    const k = keyFor(localPartyId);
    const entry = listeners.get(k) || { state: 'idle', subs: new Set() };
    entry.subs.add(cb);
    listeners.set(k, entry);
    cb(entry.state);
    return () => {
        entry.subs.delete(cb);
        if (!entry.subs.size) listeners.delete(k);
    };
}

function setState(localPartyId, state) {
    const k = keyFor(localPartyId);
    const entry = listeners.get(k) || { state: 'idle', subs: new Set() };
    entry.state = state;
    listeners.set(k, entry);
    for (const cb of entry.subs) cb(state);
}

function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        flushRetryQueue();
    }, 4000);
}

export async function flushRetryQueue() {
    while (retryQueue.length) {
        const job = retryQueue.shift();
        try {
            await job.run();
        } catch (error) {
            console.warn('[party sync retry]', error?.message || error);
            retryQueue.push(job);
            setState(job.localPartyId, 'offline');
            scheduleFlush();
            break;
        }
    }
}

/**
 * Run a live-server mutation with optimistic UI + retry.
 * @param {number} localPartyId
 * @param {{ run: () => Promise<void>, onSuccess?: () => Promise<void> }} job
 */
export async function runPartyLiveJob(localPartyId, job) {
    setState(localPartyId, 'saving');
    try {
        await job.run();
        if (job.onSuccess) await job.onSuccess();
        setState(localPartyId, 'saved');
        setTimeout(() => {
            if (getPartySyncUiState(localPartyId) === 'saved') setState(localPartyId, 'idle');
        }, 2500);
    } catch (error) {
        console.warn('[party live job]', error?.message || error);
        setState(localPartyId, 'offline');
        retryQueue.push({
            localPartyId,
            run: async () => {
                await job.run();
                if (job.onSuccess) await job.onSuccess();
                setState(localPartyId, 'saved');
            },
        });
        scheduleFlush();
        throw error;
    }
}

export async function pushPartyMealsToServer(localParty) {
    if (!localParty?.live_party_id || localParty.sync_mode !== 'live') {
        throw new Error('Party is not on live sync');
    }
    const refreshed = await partyOperations.getById(localParty.id);
    const result = await pushLocalPartyMealsToLive(refreshed);
    if (result?.party) {
        await applyLivePartySnapshot(localParty.id, result.party);
    }
    return result;
}

export async function runPushMealsJob(localPartyId) {
    const party = await partyOperations.getById(localPartyId);
    if (!party) return;
    await runPartyLiveJob(localPartyId, {
        run: async () => {
            await pushPartyMealsToServer(party);
        },
    });
}

export async function runRenamePartyJob(localPartyId, { livePartyId, name }) {
    await runPartyLiveJob(localPartyId, {
        run: async () => {
            const data = await renameLiveParty({ livePartyId, name });
            if (data?.party) await applyLivePartySnapshot(localPartyId, data.party);
        },
    });
}

export async function runUploadImageJob(localPartyId, { livePartyId, imageBase64, thumbImageBase64 }) {
    await runPartyLiveJob(localPartyId, {
        run: async () => {
            await uploadLivePartyImage({ livePartyId, imageBase64, thumbImageBase64 });
        },
    });
}

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => flushRetryQueue());
}
