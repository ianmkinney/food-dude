#!/usr/bin/env node
/**
 * Chat text handling: Markdown parsing for bubbles (and link safety), audio
 * tags hidden on screen but kept for ElevenLabs, Markdown stripped before
 * speech, TTS chunking, and bubble grouping.
 * Run: npm run test:chat-text
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./test-support/ts-hooks.mjs', import.meta.url, {
    data: { stubUrl: new URL('./test-support/ampi-stubs.mjs', import.meta.url).href, stubbed: [] },
});

const { parseMarkdown, parseInline, safeHref } = await import('../src/chat/markdown.ts');
const { stripAudioTags, hasAudioTags, toDisplayText, toSpokenText, toElevenLabsText, chunkForSpeech } = await import(
    '../src/chat/messageText.ts'
);
const { groupPosition, GROUP_GAP_MS, TIME_GAP_MS } = await import('../src/chat/messageGroups.ts');

let passed = 0;
const test = (name, fn) => {
    fn();
    passed += 1;
    console.log('ok', name);
};

test('bold, italics, code and links parse inline', () => {
    assert.deepEqual(parseInline('Use **fresh basil** and *a little* `salt`'), [
        { type: 'text', text: 'Use ' },
        { type: 'bold', children: [{ type: 'text', text: 'fresh basil' }] },
        { type: 'text', text: ' and ' },
        { type: 'italic', children: [{ type: 'text', text: 'a little' }] },
        { type: 'text', text: ' ' },
        { type: 'code', text: 'salt' },
    ]);
    const [, link] = parseInline('See [the recipe](https://example.com/soup) now');
    assert.equal(link.type, 'link');
    assert.equal(link.href, 'https://example.com/soup');
});

test('only http(s) and mailto links become links', () => {
    assert.equal(safeHref('javascript:alert(1)'), null);
    assert.equal(safeHref('data:text/html,<b>x</b>'), null);
    assert.equal(safeHref('/relative'), null);
    assert.equal(safeHref('https://ok.example/a'), 'https://ok.example/a');
    const nodes = parseInline('[click](javascript:alert(1))');
    assert.ok(nodes.every((n) => n.type !== 'link'), 'unsafe link must render as text');
});

test('raw HTML stays literal text', () => {
    const [block] = parseMarkdown('<img src=x onerror=alert(1)> <b>hi</b>');
    assert.equal(block.type, 'paragraph');
    assert.deepEqual(block.content, [{ type: 'text', text: '<img src=x onerror=alert(1)> <b>hi</b>' }]);
});

test('headings, numbered lists with blank lines, bullets and code blocks', () => {
    const blocks = parseMarkdown(
        '## Lasagna Soup\n\n1. **Brown** the sausage.\n\n2. Add noodles.\n3. Simmer.\n\n- basil\n- parmesan\n\n```\nkeep *this*\n```'
    );
    assert.deepEqual(
        blocks.map((b) => b.type),
        ['heading', 'list', 'list', 'code']
    );
    assert.equal(blocks[0].level, 2);
    assert.deepEqual(
        blocks[1].items.map((i) => i.marker),
        ['1.', '2.', '3.']
    );
    assert.equal(blocks[1].items[0].content[0].type, 'bold');
    assert.equal(blocks[2].ordered, false);
    assert.equal(blocks[3].text, 'keep *this*');
});

test('snake_case and stray asterisks are not italics', () => {
    assert.deepEqual(parseInline('use snake_case_name and 2 * 3 * 4'), [{ type: 'text', text: 'use snake_case_name and 2 * 3 * 4' }]);
});

test('audio tags are hidden on screen but kept for ElevenLabs', () => {
    const reply = "[warmly] Oh, lasagna soup! [laughs] Great pick. See [the recipe](https://x.example/r).";
    assert.ok(hasAudioTags(reply));
    assert.equal(toDisplayText(reply), 'Oh, lasagna soup! Great pick. See [the recipe](https://x.example/r).');
    assert.equal(stripAudioTags('[excited] Dinner is ready!'), 'Dinner is ready!');
    const forEleven = toElevenLabsText(reply);
    assert.ok(forEleven.includes('[warmly]') && forEleven.includes('[laughs]'));
    assert.ok(!forEleven.includes('https://'));
    assert.ok(!hasAudioTags('No tags, just [a link](https://x.example).'));
});

test('speech text has no Markdown symbols or tags', () => {
    const spoken = toSpokenText('[warmly] **Ampi** here!\n\n1. Brown the *sausage*\n2. Add `noodles`\n\n## Tips\n- Use basil');
    assert.equal(spoken, 'Ampy here! 1. Brown the sausage. 2. Add noodles. Tips. Use basil.');
    assert.ok(!/[*#`[\]]/.test(spoken));
});

test('long replies split into TTS-sized chunks at sentence boundaries', () => {
    const sentence = 'Stir the pot gently and taste as you go. ';
    const text = sentence.repeat(60);
    const chunks = chunkForSpeech(text, 800);
    assert.ok(chunks.length >= 3);
    assert.ok(chunks.every((c) => c.length <= 800));
    assert.ok(chunks.every((c) => c.endsWith('.')));
    assert.equal(chunks.join(' '), text.trim());
});

test('consecutive messages group; long pauses get a timestamp', () => {
    const t = 1_700_000_000_000;
    const msgs = [
        { role: 'user', createdAt: t },
        { role: 'user', createdAt: t + 1000 },
        { role: 'sous', createdAt: t + 2000 },
        { role: 'sous', createdAt: t + 2000 + GROUP_GAP_MS + 1 },
        { role: 'sous', createdAt: t + 2000 + GROUP_GAP_MS + 1 + TIME_GAP_MS },
    ];
    assert.deepEqual(groupPosition(msgs, 0), { first: true, last: false, showTime: true });
    assert.deepEqual(groupPosition(msgs, 1), { first: false, last: true, showTime: false });
    assert.deepEqual(groupPosition(msgs, 2), { first: true, last: true, showTime: false });
    assert.equal(groupPosition(msgs, 3).first, true);
    assert.equal(groupPosition(msgs, 4).showTime, true);
});

console.log(`All ${passed} chat text tests passed.`);
