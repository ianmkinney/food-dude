#!/usr/bin/env node
import { formatPartyAmpiReplyBody } from '../api/_lib/partyAmpiReply.js';

const SAMPLE =
    '{"reply": "Hey there! Want me to suggest a dessert?", "actions": []}';
const FENCED = '```json\n' + SAMPLE + '\n```';

let failures = 0;
const check = (label, ok) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) failures += 1;
};

const plain = formatPartyAmpiReplyBody(SAMPLE);
check('extracts reply text', plain.text === 'Hey there! Want me to suggest a dessert?');
check('not raw json on screen', !plain.text.includes('"actions"'));
check('parsed flag', plain.parsed);

const fenced = formatPartyAmpiReplyBody(FENCED);
check('fenced json', fenced.text.startsWith('Hey there!'));

const legacyStored = formatPartyAmpiReplyBody(
    '{"reply": "Saved!", "actions": [{"tool": "add_to_grocery", "args": { "items": [] }}]}'
);
check('legacy stored message repair', legacyStored.text === 'Saved!');
check('actions preserved for post hook', legacyStored.actions.length === 1);

if (failures) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
}
console.log('party ampi reply parse checks passed');
