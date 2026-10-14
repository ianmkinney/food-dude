#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { googleNonceMatches } from '../api/_lib/googleNonce.js';
import { shouldUseSameTabGoogleRedirect } from '../src/platform/googleWebRedirect.js';

const nonce = 'abc+def/nonce value';
const digest = createHash('sha256').update(nonce, 'utf8').digest();
const b64 = digest.toString('base64');
const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

assert.equal(googleNonceMatches(nonce, nonce), true);
assert.equal(googleNonceMatches(b64, nonce), true);
assert.equal(googleNonceMatches(b64url, nonce), true);
assert.equal(googleNonceMatches('other', nonce), false);
assert.equal(googleNonceMatches('', nonce), false);
assert.equal(googleNonceMatches(nonce, ''), false);
assert.equal(googleNonceMatches(undefined, nonce), false);

const iphone =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
assert.equal(shouldUseSameTabGoogleRedirect(iphone, 5), true);
assert.equal(shouldUseSameTabGoogleRedirect('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15', 5), true);
assert.equal(
    shouldUseSameTabGoogleRedirect('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5),
    true
);
assert.equal(
    shouldUseSameTabGoogleRedirect(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        0
    ),
    false
);
assert.equal(
    shouldUseSameTabGoogleRedirect(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0.0.0 Mobile/15E148 Safari/604.1',
        5
    ),
    true
);

console.log('ok google nonce match and iOS same-tab redirect decision');
