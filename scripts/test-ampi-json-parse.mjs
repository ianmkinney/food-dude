#!/usr/bin/env node
import { parseAmpiResponse, coerceAmpiDisplayText } from '../api/_lib/ampiResponseParse.js';

const EXACT =
    '{"reply":"Yes, I can hear you! I just finished creating and saving the \\"Hearty Sausage and Pasta Bake\\" recipe to your recipe book. The app should show you a card for it. Is there anything else I can help you with today?","actions":[]}';

const FENCED = '```json\n' + EXACT + '\n```';
const PREFIXED = 'Here is the response:\n' + EXACT + '\nThanks.';

let failures = 0;
const check = (label, ok) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) failures += 1;
};

for (const [label, input] of [
    ['exact string', EXACT],
    ['fenced', FENCED],
    ['prefixed', PREFIXED],
]) {
    const { reply, actions, parsed } = parseAmpiResponse(input);
    check(`${label}: parsed`, parsed);
    check(`${label}: reply human`, reply.startsWith('Yes, I can hear you!'));
    check(`${label}: no raw json in reply`, !reply.includes('"actions"'));
    check(`${label}: empty actions`, actions.length === 0);
    check(`${label}: display coerce`, coerceAmpiDisplayText(input) === reply);
}

const doubleEncoded = JSON.stringify(EXACT);
const fromDouble = parseAmpiResponse(doubleEncoded);
check('double-encoded unwraps', fromDouble.parsed && fromDouble.reply.includes('Yes, I can hear you'));

if (failures) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
}
console.log('ampi json parse checks passed');
