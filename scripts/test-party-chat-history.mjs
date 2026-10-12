#!/usr/bin/env node
/**
 * Party chat history pagination (in-memory).
 */
import { mergeServerPartyChatWithLocal } from '../api/_lib/partyChat.js';

function paginate(all, { beforeMs = 0, limit = 100 }) {
    const sorted = all.slice().sort((a, b) => a.createdAt - b.createdAt);
    let batch = sorted;
    if (beforeMs > 0) batch = sorted.filter((m) => m.createdAt < beforeMs);
    batch = batch.slice(-limit);
    return {
        messages: batch,
        hasMore: beforeMs > 0 ? batch.length === limit : sorted.length > limit,
        oldestCreatedAt: batch[0]?.createdAt ?? null,
        latestCreatedAt: batch[batch.length - 1]?.createdAt ?? 0,
    };
}

function fetchAll(all) {
    let merged = [];
    let beforeMs = 0;
    for (;;) {
        const page = paginate(all, { beforeMs, limit: 2 });
        const batch = page.messages;
        if (!batch.length) break;
        merged = beforeMs > 0 ? [...batch, ...merged] : batch;
        if (!page.hasMore) break;
        beforeMs = page.oldestCreatedAt;
    }
    return merged;
}

const rows = [
    { id: '1', createdAt: 10, body: 'a' },
    { id: '2', createdAt: 20, body: 'b' },
    { id: '3', createdAt: 30, body: 'c' },
    { id: '4', createdAt: 40, body: 'd' },
    { id: '5', createdAt: 50, body: 'e' },
];

const full = fetchAll(rows);
let failures = 0;
const check = (label, ok) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) failures += 1;
};

check('paginates all rows', full.length === 5 && full.map((r) => r.id).join(',') === '1,2,3,4,5');
check(
    'merge keeps failed local',
    mergeServerPartyChatWithLocal(full, [{ id: 'pending-x', sendState: 'failed', createdAt: 99, body: 'x' }]).length === 6
);

if (failures) process.exit(1);
console.log('party chat history checks passed');
