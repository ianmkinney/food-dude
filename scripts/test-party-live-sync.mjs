#!/usr/bin/env node
/**
 * Protocol-level two-client party live sync (in-memory Neon stand-in).
 * Tab A creates party + meal; tab B loads snapshot; B adds recipe; A polls within interval.
 */
import { dedupeServerMemberRows, upsertActivePartyMember, isHumanPartyMember } from '../api/_lib/partyMembers.js';
import { normalizePartyMembersForDisplay } from '../src/utils/partyMemberList.js';

let failures = 0;
const check = (label, ok) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) failures += 1;
};

/** Minimal in-memory party server for two tabs. */
function createMemoryPartyServer() {
    const state = {
        party: {
            id: 'party-1',
            name: 'Cozy Night',
            owner_email: 'ian@example.com',
            owner_sub: 'sub-ian',
            version: 1,
            updated_at: new Date(),
        },
        members: [],
        meals: [],
        claims: [],
    };

    const client = {
        async query(sql, params) {
            const text = String(sql).trim();
            if (text.includes('INSERT INTO party_members')) {
                const partyId = params[0];
                const displayName = params[1];
                const email = params[2];
                const googleSub = params[3];
                const identityKey = params[4];
                const tokenHash = params[5] ?? params[4];
                const existing = state.members.find(
                    (m) =>
                        m.party_id === partyId &&
                        m.status === 'active' &&
                        identityKey &&
                        m.identity_key === identityKey
                );
                if (existing) {
                    existing.display_name = displayName;
                    existing.member_token_hash = tokenHash;
                    return { rows: [{ member_id: existing.member_id }] };
                }
                const memberId = `m-${state.members.length + 1}`;
                state.members.push({
                    member_id: memberId,
                    party_id: partyId,
                    display_name: displayName,
                    email,
                    google_sub: googleSub,
                    identity_key: identityKey,
                    status: 'active',
                    joined_at: new Date(),
                });
                return { rows: [{ member_id: memberId }] };
            }
            return { rows: [] };
        },
    };

    return {
        state,
        async createOwner() {
            await upsertActivePartyMember(client, {
                partyId: state.party.id,
                displayName: 'Ian Kinney',
                email: 'ian@example.com',
                googleSub: 'sub-ian',
                memberTokenHash: 'hash',
            });
        },
        replaceMeals(meals) {
            state.meals = meals.map((m, i) => ({
                id: m.id || `meal-${i + 1}`,
                party_id: state.party.id,
                name: m.name,
                description: m.description,
                recipe_ids: m.recipeIds || [],
                recipe_meta: m.recipeMeta || {},
                updated_at: new Date(),
            }));
            state.party.version += 1;
        },
        snapshot() {
            return {
                id: state.party.id,
                name: state.party.name,
                ownerEmail: state.party.owner_email,
                version: state.party.version,
                members: dedupeServerMemberRows(state.members, { ownerEmail: state.party.owner_email })
                    .filter((m) => isHumanPartyMember(m))
                    .map((m) => ({
                        memberId: m.member_id,
                        displayName: m.display_name,
                        email: m.email,
                        status: m.status,
                        joinedAt: Date.now(),
                    })),
                meals: state.meals.map((m) => ({
                    id: m.id,
                    name: m.name,
                    description: m.description,
                    recipeIds: m.recipe_ids,
                    recipeMeta: m.recipe_meta,
                })),
                ingredientClaims: [],
            };
        },
    };
}

const server = createMemoryPartyServer();
await server.createOwner();

// Tab A: add meal with one recipe
server.replaceMeals([{ name: 'Soup', recipeIds: [101], id: 'meal-1' }]);
const snapA = server.snapshot();
check('tab A meal on server', snapA.meals.length === 1 && snapA.meals[0].recipeIds[0] === 101);

// Tab B: fresh storage — only server snapshot
const snapB = server.snapshot();
check('tab B sees soup', snapB.meals[0]?.name === 'Soup');

// Tab B: add recipe to meal
const mealsB = [...snapB.meals];
mealsB[0] = { ...mealsB[0], recipeIds: [101, 202] };
server.replaceMeals(mealsB);

// Tab A: poll (version bump)
const since = snapA.version;
const snapA2 = server.snapshot();
check('tab A poll detects version', snapA2.version > since);
check('tab A sees recipe 202', snapA2.meals[0].recipeIds.includes(202));

// Owner identity: placeholder + duplicate owner emails collapse for display
const localRows = normalizePartyMembersForDisplay(
    [
        {
            id: 1,
            user_id: 'local-user',
            user_name: 'AmpliFood Cook',
            role: 'owner',
            joined_at: 1,
        },
        {
            id: 2,
            user_id: 'member:m-1',
            user_name: 'Ian Kinney',
            member_email: 'ian@example.com',
            role: 'owner',
            sync_member_id: 'm-1',
            joined_at: 2,
        },
        {
            id: 3,
            user_id: 'email:ian@example.com',
            user_name: 'Ian Kinney',
            member_email: 'ian@example.com',
            role: 'owner',
            joined_at: 3,
        },
    ],
    { ownerEmail: 'ian@example.com' }
);
check('display drops placeholder owner', localRows.length === 1 && localRows[0].user_name === 'Ian Kinney');

if (failures) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
}
console.log('party live sync checks passed');
