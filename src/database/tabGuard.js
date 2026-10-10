// Native apps have one instance and one database owner; see tabGuard.web.js.

export class TabLockedError extends Error {
    constructor() {
        super('AmpliFood is open in another tab.');
        this.name = 'TabLockedError';
    }
}

export async function acquireTabLock() {}

export async function takeOverFromOtherTab() {}

export async function requestPeersCloseDatabase() {}

export function listenForCloseDatabase() {
    return () => {};
}

export function listenForTakeover() {
    return () => {};
}
