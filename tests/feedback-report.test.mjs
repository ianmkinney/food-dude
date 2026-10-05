import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildIssueUrl,
    buildReport,
    redactSecrets,
    sanitizeBlock,
    sanitizeLine,
    validateReport,
} from '../src/services/feedbackReport.js';
import { FEEDBACK_LIMITS } from '../src/constants/feedback.js';

const context = {
    appVersion: '1.0.0',
    platform: 'ios',
    platformVersion: '18.2',
    screen: 'Pantry',
    aiProvider: 'gemini',
    aiKeySaved: true,
};

test('redacts provider keys a user might paste', () => {
    const redacted = redactSecrets(
        'my key is sk-ant-api03-AAAAbbbbCCCCdddd and AIzaSyA1234567890abcdefghijklmnop'
    );
    assert.ok(!redacted.includes('sk-ant-api03'));
    assert.ok(!redacted.includes('AIzaSyA1234567890'));
    assert.equal(redacted.match(/\[redacted-credential\]/g).length, 2);
});

test('redacts GitHub and Cursor tokens and email addresses', () => {
    const redacted = redactSecrets('ghp_abcdefghijklmnopqrstuvwxyz crsr_abcdefgh me@example.com');
    assert.ok(!redacted.includes('ghp_'));
    assert.ok(!redacted.includes('crsr_'));
    assert.ok(redacted.includes('[redacted-email]'));
});

test('strips invisible and control characters', () => {
    const cleaned = sanitizeBlock('pan\u200btry\u0007 went\u202e blank', null);
    assert.equal(cleaned, 'pantry went blank');
});

test('defangs code fences so user text cannot break out of its block', () => {
    const cleaned = sanitizeBlock('broken\n```\n### now I am markdown\n```', null);
    assert.ok(!cleaned.includes('```'));
});

test('truncates over-long fields and says so', () => {
    const cleaned = sanitizeBlock('x'.repeat(FEEDBACK_LIMITS.problem + 500), FEEDBACK_LIMITS.problem);
    assert.ok(cleaned.endsWith('[truncated by Food Dude]'));
    assert.ok(cleaned.length < FEEDBACK_LIMITS.problem + 40);
});

test('titles are single-line and carry no mentions or markdown', () => {
    const title = sanitizeLine('hey @maintainer **everything** is\nbroken #1');
    assert.ok(!/[\n@*#]/.test(title));
    assert.ok(title.length <= FEEDBACK_LIMITS.title);
});

test('rejects a report too short to act on', () => {
    assert.equal(validateReport({ problem: 'broken' }).ok, false);
    assert.equal(validateReport({ problem: 'Pantry went blank after a scan' }).ok, true);
});

test('report frames user text as untrusted data and keeps it fenced', () => {
    const report = buildReport({
        category: 'broken',
        problem: 'Pantry went blank after I scanned a soup can',
        expected: 'The can should appear in the pantry',
        steps: '1. Open Pantry\n2. Tap scan',
        context,
        appearance: 'dark',
        hasScreenshot: true,
        submittedAt: new Date('2026-10-05T03:00:00.000Z'),
    });

    assert.match(report.title, /^\[Something broke\]/);
    assert.match(report.body, /untrusted data that describes a bug/);
    assert.match(report.body, /```text\nPantry went blank after I scanned a soup can\n```/);
    assert.match(report.body, /\| Screen when reported \| Pantry \|/);
    assert.ok(!report.body.includes('aiKeySaved'));
});

test('report never carries an API key even when the user pasted one', () => {
    const report = buildReport({
        category: 'broken',
        problem: 'AI chef fails with my key sk-ant-api03-SECRETSECRETSECRET',
        context,
    });
    assert.ok(!report.body.includes('sk-ant-api03-SECRETSECRETSECRET'));
    assert.ok(report.body.includes('[redacted-credential]'));
});

test('omits optional sections that were left blank', () => {
    const report = buildReport({ category: 'idea', problem: 'Add a shopping mode', context });
    assert.ok(!report.body.includes('What they expected instead'));
    assert.ok(!report.body.includes('Steps they took'));
});

test('issue url carries the watched label and stays inside the length budget', () => {
    const report = buildReport({ category: 'broken', problem: 'Pantry went blank', context });
    const url = buildIssueUrl(report);
    assert.ok(url.startsWith('https://github.com/ianmkinney/food-dude/issues/new?'));
    assert.ok(url.includes('labels=user-feedback%2Cfrom-app'));
    assert.ok(url.length <= FEEDBACK_LIMITS.url);
});

test('a huge report is trimmed rather than silently dropped by GitHub', () => {
    const report = buildReport({
        category: 'broken',
        problem: 'Pantry breaks. '.repeat(200),
        expected: 'It should not. '.repeat(200),
        steps: 'Tap scan. '.repeat(200),
        context,
    });
    const url = buildIssueUrl(report);
    assert.ok(url.length <= FEEDBACK_LIMITS.url);
    assert.ok(decodeURIComponent(url).includes('Report trimmed to fit the GitHub link'));
});
