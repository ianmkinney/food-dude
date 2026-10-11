#!/usr/bin/env node
import {
    dedupeServerMemberRows,
    isHumanPartyMember,
    memberIdentityKey,
} from '../api/_lib/partyMembers.js';
import {
    isHumanPartyMemberRow,
    normalizePartyMembersForDisplay,
} from '../src/utils/partyMemberList.js';

let failures = 0;
const check = (label, ok) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) failures += 1;
};

check('rejects Ampi', !isHumanPartyMember({ displayName: 'Ampi' }));
check('accepts human', isHumanPartyMember({ displayName: 'Ian' }));
check('identity email', memberIdentityKey({ email: 'a@b.com' }) === 'email:a@b.com');
check('identity sub', memberIdentityKey({ googleSub: 'sub-1' }) === 'sub:sub-1');

const dupes = dedupeServerMemberRows(
    [
        {
            member_id: '1',
            email: 'ian@example.com',
            display_name: 'Ian',
            status: 'active',
            joined_at: new Date('2020-01-01'),
        },
        {
            member_id: '2',
            email: 'ian@example.com',
            display_name: 'Ian K',
            status: 'active',
            joined_at: new Date('2021-01-01'),
        },
        { member_id: '3', display_name: 'Ampi', status: 'active', joined_at: new Date() },
    ],
    { ownerEmail: 'ian@example.com' }
);
check('server dedupe one email', dupes.length === 1 && dupes[0].member_id === '1');
check('server drops Ampi', !dupes.some((m) => m.display_name === 'Ampi'));

const local = normalizePartyMembersForDisplay(
    [
        { id: 1, user_id: 'u1', user_name: 'Ian', member_email: 'ian@example.com', role: 'owner', joined_at: 1 },
        { id: 2, user_id: 'u2', user_name: 'Ian', member_email: 'ian@example.com', role: 'member', joined_at: 2 },
        { id: 3, user_id: 'ampi', user_name: 'Ampi', role: 'member', joined_at: 3 },
    ],
    { ownerEmail: 'ian@example.com' }
);
check('client dedupe owner duplicate email', local.length === 1);
check('client rejects Ampi row', !isHumanPartyMemberRow({ user_name: 'AmpliFood' }));

if (failures) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
}
console.log('party member checks passed');
