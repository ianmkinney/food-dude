#!/usr/bin/env node
import { incomingWins, mergePushBatch, pickSyncWinner } from '../api/_lib/syncMerge.js';

let failures = 0;
const check = (label, ok) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) failures += 1;
};

check('remote newer wins', pickSyncWinner({ updatedAtMs: 1, deviceId: 'a' }, { updatedAtMs: 2, deviceId: 'b' })?.updatedAtMs === 2);
check(
    'tie device id',
    pickSyncWinner({ updatedAtMs: 5, deviceId: 'a' }, { updatedAtMs: 5, deviceId: 'b' })?.deviceId === 'b'
);

check('incomingWins when local missing', incomingWins(null, { updatedAtMs: 1, deviceId: 'x' }));
check('incomingWins false when stale', !incomingWins({ updatedAtMs: 9, deviceId: 'a' }, { updatedAtMs: 1, deviceId: 'b' }));

const server = new Map();
const { accepted, skipped } = mergePushBatch(server, [
    { collection: 'recipes', recordId: '1', updatedAtMs: 100, deviceId: 'd1', deleted: false, payload: { id: 1 } },
]);
check('first push accepted', accepted.length === 1 && skipped.length === 0);

server.set('recipes\0' + '1', {
    collection: 'recipes',
    recordId: '1',
    updatedAtMs: 100,
    deviceId: 'd1',
    deleted: false,
    payload: { id: 1 },
});
const stale = mergePushBatch(server, [
    { collection: 'recipes', recordId: '1', updatedAtMs: 50, deviceId: 'd2', deleted: false, payload: { id: 1 } },
]);
check('stale push skipped', stale.accepted.length === 0 && stale.skipped[0]?.reason === 'stale');

const newer = mergePushBatch(server, [
    { collection: 'recipes', recordId: '1', updatedAtMs: 200, deviceId: 'd2', deleted: false, payload: { id: 1, title: 'x' } },
]);
check('newer push accepted', newer.accepted.length === 1);

if (failures) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
}
console.log('sync merge checks passed');
