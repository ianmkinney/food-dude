#!/usr/bin/env node
/**
 * Party identity dedupe migration + member upsert against conflicting production-like rows.
 */
import {
    mergeDuplicatePartyMembersSafe,
    upsertActivePartyMember,
    memberIdentityKey,
} from '../api/_lib/partyMembers.js';
import { PARTY_IDENTITY_MIGRATION_KEY, PARTY_MEMBERS_IDENTITY_UNIQUE_INDEX } from '../api/_lib/partySchema.js';

const PARTY_ID = '6fa00536-ffaf-4e8d-bfcc-11c099fbedd2';
const EMAIL = 'ikinney51@gmail.com';
const IDENTITY = memberIdentityKey({ email: EMAIL });

let failures = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
    if (!ok) failures += 1;
};

function createMockDb() {
    const parties = [
        {
            id: PARTY_ID,
            owner_email: EMAIL,
            owner_sub: 'sub-owner',
            name: 'Test Party',
            version: 1,
        },
    ];
    const members = [
        {
            member_id: '11111111-1111-1111-1111-111111111111',
            party_id: PARTY_ID,
            display_name: 'Ian',
            email: EMAIL,
            google_sub: 'sub-owner',
            identity_key: IDENTITY,
            status: 'active',
            joined_at: new Date('2024-01-01'),
            member_token_hash: 'h1',
        },
        {
            member_id: '22222222-2222-2222-2222-222222222222',
            party_id: PARTY_ID,
            display_name: 'Ian duplicate',
            email: EMAIL,
            google_sub: 'sub-owner',
            identity_key: IDENTITY,
            status: 'active',
            joined_at: new Date('2024-06-01'),
            member_token_hash: 'h2',
        },
        {
            member_id: '33333333-3333-3333-3333-333333333333',
            party_id: PARTY_ID,
            display_name: 'Legacy row',
            email: EMAIL,
            google_sub: null,
            identity_key: null,
            status: 'active',
            joined_at: new Date('2023-01-01'),
            member_token_hash: 'h3',
        },
    ];
    const claims = [
        {
            id: 'c1',
            claimed_by_member_id: '22222222-2222-2222-2222-222222222222',
        },
    ];
    const migrations = new Set();
    const activeIdentityKeys = new Set();

    const enforceUniqueIndex = () => {
        activeIdentityKeys.clear();
        for (const m of members) {
            if (m.status === 'active' && m.identity_key) {
                const k = `${m.party_id}:${m.identity_key}`;
                if (activeIdentityKeys.has(k)) {
                    const err = new Error('duplicate key value violates unique constraint "idx_party_members_party_identity"');
                    err.code = '23505';
                    throw err;
                }
                activeIdentityKeys.add(k);
            }
        }
    };

    const client = {
        async query(sql, params = []) {
            const text = String(sql).replace(/\s+/g, ' ').trim();

            if (text.includes('FROM party_schema_migrations')) {
                return { rows: migrations.has(params[0]) ? [{ '?column?': 1 }] : [] };
            }
            if (text.startsWith('INSERT INTO party_schema_migrations')) {
                migrations.add(params[0]);
                return { rows: [] };
            }
            if (text.includes('CREATE UNIQUE INDEX')) {
                enforceUniqueIndex();
                return { rows: [] };
            }

            if (text.includes('lower(trim(pm.email))') && text.includes('HAVING COUNT(*) > 1')) {
                const groups = new Map();
                for (const m of members.filter((x) => x.status === 'active' && x.email)) {
                    const norm = String(m.email).trim().toLowerCase();
                    const key = `${m.party_id}:${norm}`;
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key).push(m.member_id);
                }
                const rows = [];
                for (const [, ids] of groups) {
                    if (ids.length > 1) {
                        const sortRank = (m, p) => {
                            const emailMatch =
                                m.email && p?.owner_email &&
                                String(m.email).trim().toLowerCase() === String(p.owner_email).trim().toLowerCase();
                            if (emailMatch && m.google_sub && m.google_sub === p.owner_sub) return 0;
                            if (emailMatch) return 1;
                            return 2;
                        };
                        const sorted = ids.sort((a, b) => {
                            const ma = members.find((m) => m.member_id === a);
                            const mb = members.find((m) => m.member_id === b);
                            const p = parties.find((p) => p.id === ma.party_id);
                            const ra = sortRank(ma, p);
                            const rb = sortRank(mb, p);
                            if (ra !== rb) return ra - rb;
                            return new Date(ma.joined_at) - new Date(mb.joined_at);
                        });
                        rows.push({ party_id: PARTY_ID, member_ids: sorted });
                    }
                }
                return { rows };
            }

            if (text.includes('GROUP BY pm.party_id, trim(pm.google_sub)')) {
                return { rows: [] };
            }

            if (text.includes('GROUP BY party_id, identity_key')) {
                const groups = new Map();
                for (const m of members.filter((x) => x.status === 'active' && x.identity_key)) {
                    const key = `${m.party_id}:${m.identity_key}`;
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key).push(m.member_id);
                }
                const rows = [];
                for (const [, ids] of groups) {
                    if (ids.length > 1) {
                        const sorted = [...ids].sort(
                            (a, b) =>
                                new Date(members.find((m) => m.member_id === a).joined_at) -
                                new Date(members.find((m) => m.member_id === b).joined_at)
                        );
                        rows.push({ party_id: PARTY_ID, identity_key: IDENTITY, member_ids: sorted });
                    }
                }
                return { rows };
            }

            if (text.includes('UPDATE party_meal_ingredient_claims')) {
                const survivor = params[0];
                const losers = params[1];
                for (const c of claims) {
                    if (losers.includes(c.claimed_by_member_id)) {
                        c.claimed_by_member_id = survivor;
                    }
                }
                return { rows: [] };
            }

            if (text.includes('UPDATE party_members') && text.includes("status = 'removed'")) {
                const losers = params[0];
                for (const m of members) {
                    if (losers.includes(m.member_id)) {
                        m.status = 'removed';
                        m.identity_key = null;
                        m.member_token_hash = null;
                    }
                }
                return { rows: [] };
            }

            if (text.includes('SET identity_key =') && text.includes('lower(trim(pm.email))')) {
                for (const m of members) {
                    if (m.status !== 'active') continue;
                    if (m.email && (!m.identity_key || m.identity_key === '')) {
                        const key = `email:${String(m.email).trim().toLowerCase()}`;
                        const conflict = members.some(
                            (o) =>
                                o.member_id !== m.member_id &&
                                o.party_id === m.party_id &&
                                o.status === 'active' &&
                                o.identity_key === key
                        );
                        if (!conflict) m.identity_key = key;
                    }
                }
                enforceUniqueIndex();
                return { rows: [] };
            }

            if (text.includes('SET identity_key =') && text.includes('trim(pm.google_sub)')) {
                for (const m of members) {
                    if (m.status !== 'active') continue;
                    if (m.google_sub) {
                        const key = `sub:${String(m.google_sub).trim()}`;
                        const conflict = members.some(
                            (o) =>
                                o.member_id !== m.member_id &&
                                o.party_id === m.party_id &&
                                o.status === 'active' &&
                                o.identity_key === key
                        );
                        if (!conflict) m.identity_key = key;
                    }
                }
                enforceUniqueIndex();
                return { rows: [] };
            }

            if (text.includes('INSERT INTO party_members') && text.includes('ON CONFLICT')) {
                const [partyId, displayName, email, googleSub, identityKey, tokenHash] = params;
                const existing = members.find(
                    (m) =>
                        m.party_id === partyId &&
                        m.status === 'active' &&
                        m.identity_key === identityKey
                );
                if (existing) {
                    existing.display_name = displayName;
                    existing.email = email || existing.email;
                    existing.google_sub = googleSub || existing.google_sub;
                    existing.member_token_hash = tokenHash || existing.member_token_hash;
                    return { rows: [{ member_id: existing.member_id }] };
                }
                const memberId = `new-${members.length + 1}`;
                members.push({
                    member_id: memberId,
                    party_id: partyId,
                    display_name: displayName,
                    email,
                    google_sub: googleSub,
                    identity_key: identityKey,
                    status: 'active',
                    joined_at: new Date(),
                    member_token_hash: tokenHash,
                });
                enforceUniqueIndex();
                return { rows: [{ member_id: memberId }] };
            }

            return { rows: [] };
        },
    };

    return { client, members, claims, migrations, enforceUniqueIndex };
}

const db = createMockDb();
let threw = false;
try {
    db.enforceUniqueIndex();
} catch {
    threw = true;
}
check('conflicting seed violates unique index before migration', threw);

await mergeDuplicatePartyMembersSafe(db.client);

const active = db.members.filter((m) => m.status === 'active' && m.party_id === PARTY_ID);
const expectedKey = memberIdentityKey({ email: EMAIL, googleSub: 'sub-owner' });
const withKey = active.filter((m) => m.identity_key === expectedKey);
check('migration leaves one active row per identity', withKey.length === 1, `count=${withKey.length}`);
check(
    'survivor is owner-priority oldest',
    withKey[0]?.member_id === '11111111-1111-1111-1111-111111111111',
    withKey[0]?.member_id
);
check(
    'claims moved to survivor',
    db.claims[0].claimed_by_member_id === '11111111-1111-1111-1111-111111111111',
    db.claims[0].claimed_by_member_id
);

db.migrations.add(PARTY_IDENTITY_MIGRATION_KEY);
await db.client.query(PARTY_MEMBERS_IDENTITY_UNIQUE_INDEX);
check('unique index applies after dedupe', true);

const memberId = await upsertActivePartyMember(db.client, {
    partyId: PARTY_ID,
    displayName: 'Ian rejoin',
    email: EMAIL,
    googleSub: 'sub-owner',
    memberTokenHash: 'new-hash',
});
check('join upsert returns existing survivor', memberId === '11111111-1111-1111-1111-111111111111', memberId);

const createPartyId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
db.members.push({
    member_id: 'owner-only',
    party_id: createPartyId,
    display_name: 'Owner',
    email: 'owner@example.com',
    google_sub: 'sub-new',
    identity_key: null,
    status: 'active',
    joined_at: new Date(),
    member_token_hash: null,
});
const createdId = await upsertActivePartyMember(db.client, {
    partyId: createPartyId,
    displayName: 'Owner',
    email: 'owner@example.com',
    googleSub: 'sub-new',
    memberTokenHash: 'tok',
});
check('create upsert assigns member', Boolean(createdId));

const { ensureBackupSchema, ensurePartySchema } = await import('../api/_lib/partyDb.js');
check('backup schema helper exported', typeof ensureBackupSchema === 'function');
check('party schema helper exported', typeof ensurePartySchema === 'function');

if (failures) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
}
console.log('party schema dedupe checks passed');
