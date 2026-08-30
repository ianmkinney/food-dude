/**
 * The one function screens call when their domain learns something another
 * planet should know about.
 *
 * A signal both persists (so the Bridge log survives a restart) and announces
 * itself on the event bus (so a craft launches immediately if the Bridge is
 * mounted). Callers name only the kind and the payload — routing comes from
 * SIGNAL_MANIFEST.
 *
 * Transmission never throws. A signal is a flourish on top of a save that has
 * already succeeded; losing the flourish must never cost the user their data
 * or show them an error about a spaceship.
 */

import { signalOperations } from '../database/galaxy';
import { EVENTS, emit } from './eventBus';
import { getManifest } from './signalKinds';

export async function transmit(kind, { payloadRef = null, payload = null } = {}) {
    const manifest = getManifest(kind);
    if (!manifest) {
        console.warn(`[signals] unknown signal kind "${kind}" — nothing transmitted.`);
        return null;
    }

    try {
        const row = await signalOperations.create({
            sourcePlanet: manifest.source,
            targetPlanet: manifest.target,
            kind: manifest.kind,
            payloadRef,
            payload,
        });

        // `create` guards its own failures and resolves null rather than
        // throwing, so an unwritable table lands here.
        if (!row) return null;

        emit(EVENTS.SIGNAL_CREATED, { signal: row, manifest });
        return row;
    } catch (error) {
        console.warn(`[signals] could not transmit "${kind}":`, error);
        return null;
    }
}

/**
 * Sends several signals in order. Used where one action has more than one
 * consequence, such as a saved workout reporting both burn and load.
 */
export async function transmitAll(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return [];
    const sent = [];
    for (const entry of entries) {
        if (!entry || !entry.kind) continue;
        const row = await transmit(entry.kind, {
            payloadRef: entry.payloadRef ?? null,
            payload: entry.payload ?? null,
        });
        if (row) sent.push(row);
    }
    return sent;
}

export default transmit;
