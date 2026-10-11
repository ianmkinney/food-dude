// One AmpliFood tab owns the on-device database at a time. OPFS hands out its
// file handles to a single worker, so a second tab fails with InvalidStateError.
// Web Locks make ownership explicit; BroadcastChannel asks cooperative release.
// iOS Safari suspends background tabs, so take-over must time out, steal the lock,
// and fall back to an IndexedDB mirror — never hang on "Moving here…".

const LOCK_NAME = 'amplifood-db';
const CHANNEL_NAME = 'amplifood-db';
const TAB_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const DEFAULT_TAKEOVER_MS = 3000;

export class TabLockedError extends Error {
    constructor() {
        super('AmpliFood is open in another tab.');
        this.name = 'TabLockedError';
    }
}

const hasLocks = () => typeof navigator !== 'undefined' && !!navigator.locks?.request;
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;

let held = false;
let closeDbHandler = null;
let lockSessionEnd = null;
let nextOpenLenient = false;
let preferMirrorAfterTakeover = false;
const lockLostListeners = new Set();

/** After takeOverFromOtherTab, openAppDatabase should not retry OPFS for tens of seconds. */
export function consumePreferMirrorAfterTakeover() {
    const value = preferMirrorAfterTakeover;
    preferMirrorAfterTakeover = false;
    return value;
}

export function isTabLockHeld() {
    return held;
}

function notifyLockLost(reason) {
    if (!held) return;
    held = false;
    lockSessionEnd = null;
    for (const listener of lockLostListeners) {
        try {
            listener(reason);
        } catch (error) {
            console.warn('[db] lock-lost listener failed:', error?.message || error);
        }
    }
}

function endLockSession() {
    if (lockSessionEnd) {
        lockSessionEnd();
        lockSessionEnd = null;
    }
    held = false;
}

/**
 * @param {LockManagerLockOptions} options
 * @returns {Promise<boolean>} whether this tab now holds the lock
 */
function requestExclusiveLock(options) {
    if (!hasLocks()) {
        held = true;
        return Promise.resolve(true);
    }
    return new Promise((resolve, reject) => {
        navigator.locks
            .request(LOCK_NAME, options, (lock) => {
                if (!lock) {
                    resolve(false);
                    return undefined;
                }
                held = true;
                resolve(true);
                return new Promise((release) => {
                    lockSessionEnd = release;
                }).catch((error) => {
                    notifyLockLost(error);
                    throw error;
                });
            })
            .catch(reject);
    });
}

/** Take the database lock, or throw TabLockedError if another tab has it. */
export async function acquireTabLock() {
    if (held || !hasLocks()) return;

    const lenient = nextOpenLenient;
    if (nextOpenLenient) nextOpenLenient = false;

    let ok = await requestExclusiveLock({ mode: 'exclusive', ifAvailable: true });
    if (!ok && lenient) {
        ok = await tryStealLock();
    }
    if (!ok && lenient) {
        console.warn('[db] continuing without Web Lock (IndexedDB mirror may be used)');
        return;
    }
    if (!ok) throw new TabLockedError();
}

async function tryStealLock() {
    if (!hasLocks()) return true;
    try {
        return await requestExclusiveLock({ mode: 'exclusive', steal: true });
    } catch (error) {
        console.warn('[db] lock steal failed:', error?.message || error);
        return false;
    }
}

/**
 * Ask the owning tab to release, wait up to timeoutMs, then steal the lock.
 * Never blocks indefinitely — sets nextOpenLenient so open can use IDB mirror.
 */
export async function takeOverFromOtherTab(timeoutMs = DEFAULT_TAKEOVER_MS) {
    if (!hasLocks()) return;
    nextOpenLenient = true;
    preferMirrorAfterTakeover = true;
    channel?.postMessage({ type: 'takeover' });

    const deadline = Date.now() + timeoutMs;
    const remaining = () => Math.max(0, deadline - Date.now());

    await requestPeersCloseDatabase(Math.min(1200, remaining()));

    if (held) return;

    while (remaining() > 50 && !held) {
        const slice = Math.min(350, remaining());
        const got = await requestExclusiveLock({ mode: 'exclusive', ifAvailable: true });
        if (got) return;

        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = setTimeout(() => controller?.abort(), slice);
        try {
            if (controller) {
                const ok = await new Promise((resolve, reject) => {
                    navigator.locks
                        .request(
                            LOCK_NAME,
                            { mode: 'exclusive', ifAvailable: true, signal: controller.signal },
                            (lock) => {
                                if (!lock) {
                                    resolve(false);
                                    return undefined;
                                }
                                held = true;
                                resolve(true);
                                return new Promise((release) => {
                                    lockSessionEnd = release;
                                }).catch((error) => {
                                    notifyLockLost(error);
                                    throw error;
                                });
                            }
                        )
                        .catch(reject);
                });
                if (ok) return;
            }
        } catch (error) {
            if (error?.name !== 'AbortError') {
                console.warn('[db] takeover wait:', error?.message || error);
            }
        } finally {
            clearTimeout(timer);
        }
    }

    if (!held) {
        await tryStealLock();
    }
}

/** Voluntarily release the Web Lock (after closing SQLite). */
export function releaseTabLock() {
    endLockSession();
}

/** Subscribe when another tab steals the lock or the browser ends our lock session. */
export function onTabLockLost(listener) {
    lockLostListeners.add(listener);
    return () => lockLostListeners.delete(listener);
}

/** Ask other tabs to close their SQLite connection (frees OPFS / worker VFS state). */
export async function requestPeersCloseDatabase(timeoutMs = 2500) {
    if (!channel) return;
    await new Promise((resolve) => {
        const timer = setTimeout(() => {
            channel.removeEventListener('message', onMessage);
            resolve();
        }, timeoutMs);
        const onMessage = () => {};
        channel.addEventListener('message', onMessage);
        channel.postMessage({ type: 'close-db', tabId: TAB_ID, version: 1 });
    });
}

/** In the owning tab: close SQLite when a peer is opening the database. */
export function listenForCloseDatabase(onClose) {
    closeDbHandler = onClose;
    if (!channel) return () => {};
    const handler = async (event) => {
        const data = event?.data;
        if (data?.type === 'close-db' && data.tabId !== TAB_ID && closeDbHandler) {
            try {
                await closeDbHandler();
            } catch (error) {
                console.warn('[db] peer close-db handler failed:', error?.message || error);
            }
            releaseTabLock();
            channel.postMessage({ type: 'close-db-ack', tabId: TAB_ID });
        }
    };
    channel.addEventListener('message', handler);
    return () => channel.removeEventListener('message', handler);
}

/** Owning tab: release DB handles when another tab wants to take over (no reload). */
export function listenForTakeover(onYield) {
    if (!channel) return () => {};
    const handler = (event) => {
        if (event?.data?.type === 'takeover' && held) onYield();
    };
    channel.addEventListener('message', handler);
    return () => channel.removeEventListener('message', handler);
}

async function queryStillHoldsLock() {
    if (!hasLocks() || !held) return held;
    try {
        const state = await navigator.locks.query();
        const heldLocks = state?.held || [];
        return heldLocks.some((entry) => entry.name === LOCK_NAME);
    } catch {
        return held;
    }
}

/** pagehide / freeze / resume: release handles and detect stolen locks. */
export function installTabLifecycleHandlers({ onRelease, onLockLost }) {
    if (typeof window === 'undefined') return () => {};

    const releaseForSuspend = () => {
        if (!held) return;
        onRelease?.();
        releaseTabLock();
    };

    const checkLockAfterResume = async () => {
        if (!held) return;
        const still = await queryStillHoldsLock();
        if (!still) {
            notifyLockLost(new Error('lock-lost'));
            onLockLost?.();
        }
    };

    const onPageHide = () => releaseForSuspend();
    const onFreeze = () => releaseForSuspend();
    const onPageShow = () => {
        checkLockAfterResume();
    };
    const onVisibility = () => {
        if (document.visibilityState === 'visible') {
            checkLockAfterResume();
        }
    };

    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('freeze', onFreeze);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('freeze', onFreeze);
        window.removeEventListener('pageshow', onPageShow);
        document.removeEventListener('visibilitychange', onVisibility);
    };
}
