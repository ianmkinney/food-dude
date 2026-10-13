#!/usr/bin/env node
import { formatPartyAmpiReplyBody, visiblePartyAmpiContent } from '../api/_lib/partyAmpiReply.js';
import { partyChatPostRejection } from '../api/_lib/partyChat.js';

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

const emptyReply = formatPartyAmpiReplyBody(
    '{"reply":"","actions":[{"tool":"create_recipe","args":{"title":"Mexican Street Corn Salad","ingredients":[{"ingredient":"corn","quantity":"4","unit":"ears"}],"instructions":["Grill corn"]}}]}'
);
check('empty reply synthesized from create_recipe', emptyReply.text.includes('Mexican'));
check('draft card built', emptyReply.cards?.length === 1);

const storedWithHint = `${JSON.stringify({
    reply: '',
    actions: [
        {
            tool: 'create_recipe',
            args: {
                title: 'Mexican Street Corn Salad',
                ingredients: [{ ingredient: 'corn', quantity: '4', unit: 'ears' }],
                instructions: ['Grill corn'],
            },
        },
    ],
})}\n\nOpen Ampi in the app to confirm recipe or list changes.`;
const repaired = visiblePartyAmpiContent({ body: storedWithHint, attachment: null });
check('stored empty-reply JSON repairs display text', repaired.text.includes('Mexican'));
check('stored empty-reply JSON rebuilds a card', repaired.cards.length === 1);
check('ampi post with empty body is rejected', partyChatPostRejection({ text: '', isAmpi: true, attachment: { ampi: { cards: [{ type: 'recipe_draft' }] } } }) === 'Ampi replies need text.');
check('non-empty ampi post is allowed', partyChatPostRejection({ text: 'Here is dinner.', isAmpi: true, attachment: null }) == null);

if (failures) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
}
console.log('party ampi reply parse checks passed');
