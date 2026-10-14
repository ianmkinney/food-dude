#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { googleNonceMatches } from '../api/_lib/googleNonce.js';
import {
    PRODUCTION_GOOGLE_REDIRECT_URI,
    googleRedirectUri,
    googleSignInErrorMessage,
    isStandaloneWebApp,
    shouldUseSameTabGoogleRedirect,
} from '../src/platform/googleWebRedirect.js';

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
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
        0
    ),
    true
);
assert.equal(
    shouldUseSameTabGoogleRedirect(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        0,
        { standalone: true }
    ),
    true
);
assert.equal(isStandaloneWebApp({ navigatorStandalone: true }), true);
assert.equal(isStandaloneWebApp({ displayMode: 'standalone' }), true);
assert.equal(isStandaloneWebApp({ displayMode: 'browser' }), false);

assert.equal(PRODUCTION_GOOGLE_REDIRECT_URI, 'https://amplifood.vercel.app/auth/google-callback');
assert.equal(PRODUCTION_GOOGLE_REDIRECT_URI.endsWith('.html'), false);
assert.equal(googleRedirectUri('https://amplifood.vercel.app'), PRODUCTION_GOOGLE_REDIRECT_URI);
assert.equal(googleRedirectUri('https://amplifood.vercel.app/'), PRODUCTION_GOOGLE_REDIRECT_URI);
assert.equal(googleRedirectUri('http://localhost:8080'), 'http://localhost:8080/auth/google-callback');
assert.match(googleSignInErrorMessage('redirect_uri_mismatch', '', PRODUCTION_GOOGLE_REDIRECT_URI), /https:\/\/amplifood\.vercel\.app\/auth\/google-callback/);
assert.match(googleSignInErrorMessage('redirect_uri_mismatch', '', PRODUCTION_GOOGLE_REDIRECT_URI), /Authorized redirect URIs/);
assert.match(googleSignInErrorMessage('redirect_uri_mismatch', '', PRODUCTION_GOOGLE_REDIRECT_URI), /google-callback\.html is a different URI/);
assert.match(googleSignInErrorMessage('disallowed_useragent', '', ''), /home-screen/);
assert.equal(googleSignInErrorMessage('access_denied', '', ''), 'cancelled');
assert.match(googleSignInErrorMessage('incomplete', '', 'https://amplifood.vercel.app/auth/google-callback'), /didn't finish/);
assert.equal(
    shouldUseSameTabGoogleRedirect(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0.0.0 Mobile/15E148 Safari/604.1',
        5
    ),
    true
);

console.log('ok google nonce match and iOS same-tab redirect decision');
