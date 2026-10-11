// Native apps have one instance and one database owner; see tabGuard.web.js.

export class TabLockedError extends Error {
    constructor() {
        super('AmpliFood is open in another tab.');
        this.name = 'TabLockedError';
    }
}

export function isTabLockHeld() {
    return true;
}

export async function acquireTabLock() {}

export async function takeOverFromOtherTab() {}

export async function requestPeersCloseDatabase() {}

export function releaseTabLock() {}

export function onTabLockLost() {
    return () => {};
}

export function listenForCloseDatabase() {
    return () => {};
}

export function listenForTakeover() {
    return () => {};
}

export function installTabLifecycleHandlers() {
    return () => {};
}

export function consumePreferMirrorAfterTakeover() {
    return false;
}
