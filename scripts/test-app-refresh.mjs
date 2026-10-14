#!/usr/bin/env node
/**
 * Installed-app refresh asks a service worker to update, then revalidates the page.
 */
import { prepareAppRefresh } from '../src/layout/appRefresh.js';

let failures = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
    if (!ok) failures += 1;
};

const noWorker = await prepareAppRefresh({
    href: 'https://amplifood.vercel.app/',
    fetch: async (href, options) => {
        check('revalidate uses the page url', href === 'https://amplifood.vercel.app/');
        check('revalidate bypasses the cache', options?.cache === 'reload');
        return { ok: true };
    },
});
check('a page with no service worker still revalidates', noWorker.includes('revalidated'), noWorker.join(','));

let updated = false;
let message = null;
const withWorker = await prepareAppRefresh({
    href: 'https://amplifood.vercel.app/pantry',
    serviceWorker: {
        async getRegistration() {
            return {
                async update() {
                    updated = true;
                },
                waiting: {
                    postMessage(value) {
                        message = value;
                    },
                },
            };
        },
    },
    fetch: async () => ({ ok: true }),
});
check('update runs before reload', updated === true);
check('a waiting worker is told to skip waiting', message?.type === 'SKIP_WAITING', JSON.stringify(message));
check('worker path still revalidates', withWorker.includes('update') && withWorker.includes('skipWaiting') && withWorker.includes('revalidated'));

const installing = await prepareAppRefresh({
    serviceWorker: {
        async getRegistration() {
            return {
                installing: {
                    postMessage(value) {
                        message = value;
                    },
                },
            };
        },
    },
});
check('an installing worker gets the same message', message?.type === 'SKIP_WAITING' && installing.includes('skipWaiting'));

const broken = await prepareAppRefresh({
    href: 'https://amplifood.vercel.app/',
    serviceWorker: {
        async getRegistration() {
            throw new Error('offline');
        },
    },
    fetch: async () => {
        throw new Error('offline');
    },
});
check('a failed check does not throw', broken.includes('service-worker-error') && broken.includes('revalidate-error'), broken.join(','));

const slow = await prepareAppRefresh({
    timeoutMs: 30,
    href: 'https://amplifood.vercel.app/',
    serviceWorker: {
        getRegistration: () => new Promise(() => {}),
    },
    fetch: () => new Promise(() => {}),
});
check('a hung update check gives up', slow.includes('service-worker-timeout') && slow.includes('revalidate-timeout'), slow.join(','));

if (failures) process.exit(1);
console.log('\napp refresh checks passed');
