#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolveRecipeContributorName } from '../src/utils/partyMealMeta.js';

let failures = 0;
const check = (label, ok) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) failures += 1;
};

const members = [
    { sync_member_id: 'm-alex', user_name: 'Alex Cook', role: 'owner', user_id: 'u1' },
    { sync_member_id: 'm-jordan', user_name: 'Jordan Lee', user_id: 'u2' },
];

check(
    'uses display name from meta',
    resolveRecipeContributorName({ addedByDisplayName: 'Sam' }, members) === 'Sam'
);
check(
    'resolves member id to party member name',
    resolveRecipeContributorName({ addedByMemberId: 'm-jordan' }, members) === 'Jordan Lee'
);
check(
    'falls back without Someone',
    resolveRecipeContributorName({}, members, { created_by: 'u1' }, { user_id: 'u1', name: 'Alex Cook' }) === 'Alex Cook'
);

if (failures) process.exit(1);
console.log('party meal meta checks passed');
