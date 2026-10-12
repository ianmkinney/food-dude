#!/usr/bin/env node
/**
 * Documents party chat auth: member token may be used without a Google session bearer.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const partyIndex = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'api', 'party', 'index.js'),
    'utf8'
);

let failures = 0;
const check = (label, ok) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) failures += 1;
};

check('optionalUserSession helper exists', partyIndex.includes('async function optionalUserSession'));
const needsBlock =
    partyIndex.match(/const needsSession = \[([\s\S]*?)\]\.includes\(action\);/)?.[1] || '';
check('changes_since not in strict needsSession list', !needsBlock.includes("'changes_since'"));
check('chat_post not in strict needsSession list', !needsBlock.includes("'chat_post'"));
check('chat actions use optionalUserSession', partyIndex.includes("const chatActions = ['changes_since', 'chat_post', 'chat_delete']"));
check('changes_since allows member token only', partyIndex.includes('if (!session && !memberToken)'));

if (failures) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
}
console.log('party chat auth checks passed');
