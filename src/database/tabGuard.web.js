// One AmpliFood tab owns the on-device database at a time. OPFS hands out its
// file handles to a single worker, so a second tab (or a sign-in popup that
// booted the whole app) fails with InvalidStateError / NoModificationAllowedError.
// A Web Lock makes ownership explicit, and a BroadcastChannel lets a tab ask the
// owner to step aside ("Use here").

const LOCK_NAME = 'amplifood-db';
const CHANNEL_NAME = 'amplifood-db';

export class TabLockedError extends Error {
    constructor() {
        super('AmpliFood is open in another tab.');
        this.name = 'TabLockedError';
    }
}

const hasLocks = () => typeof navigator !== 'undefined' && !!navigator.locks?.request;
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;

let held = false;

function holdLock(options) {
    return new Promise((resolve, reject) => {
        navigator.locks
            .request(LOCK_NAME, options, (lock) => {
                if (!lock) {
                    resolve(false);
                    return undefined;
                }
                held = true;
                resolve(true);
                // Held until the page unloads.
                return new Promise(() => {});
            })
            .catch(reject);
    });
}

/** Take the database lock, or throw TabLockedError if another tab has it. */
export async function acquireTabLock() {
    if (held || !hasLocks()) return;
    const ok = await holdLock({ mode: 'exclusive', ifAvailable: true });
    if (!ok) throw new TabLockedError();
}

/**
 * Ask the owning tab to let go, then wait for the lock. The owner reloads
 * itself, which also ends its SQLite worker and frees the OPFS handles.
 */
export async function takeOverFromOtherTab(timeoutMs = 8000) {
    if (!hasLocks()) return;
    channel?.postMessage({ type: 'takeover' });
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), timeoutMs);
    try {
        await holdLock({ mode: 'exclusive', signal: controller?.signal });
    } finally {
        clearTimeout(timer);
    }
}

/** In the owning tab: step aside when another tab asks to take over. */
export function listenForTakeover(onYield) {
    if (!channel) return () => {};
    const handler = (event) => {
        if (event?.data?.type === 'takeover' && held) onYield();
    };
    channel.addEventListener('message', handler);
    return () => channel.removeEventListener('message', handler);
}
