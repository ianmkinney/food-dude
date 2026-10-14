/**
 * Look for a newer installed copy, then the caller reloads the page.
 * A service worker is optional: this app may not register one.
 */

const DEFAULT_TIMEOUT_MS = 4000;

function withTimeout(promise, ms) {
    return new Promise((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            resolve('timeout');
        }, ms);
        Promise.resolve(promise)
            .then((value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(value);
            })
            .catch(() => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve('error');
            });
    });
}

/**
 * @param {{ serviceWorker?: { getRegistration?: () => Promise<any> }, fetch?: Function, href?: string, timeoutMs?: number }} [env]
 * @returns {Promise<string[]>}
 */
export async function prepareAppRefresh(env = {}) {
    const actions = [];
    const serviceWorker = env.serviceWorker;
    const timeoutMs = env.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (serviceWorker && typeof serviceWorker.getRegistration === 'function') {
        const outcome = await withTimeout(
            (async () => {
                const registration = await serviceWorker.getRegistration();
                if (!registration) return 'none';
                if (typeof registration.update === 'function') {
                    await registration.update();
                    actions.push('update');
                }
                const pending = registration.waiting || registration.installing;
                if (pending && typeof pending.postMessage === 'function') {
                    pending.postMessage({ type: 'SKIP_WAITING' });
                    actions.push('skipWaiting');
                }
                return 'ok';
            })(),
            timeoutMs
        );
        if (outcome === 'error') actions.push('service-worker-error');
        if (outcome === 'timeout') actions.push('service-worker-timeout');
    }

    if (typeof env.fetch === 'function' && env.href) {
        const outcome = await withTimeout(env.fetch(env.href, { cache: 'reload' }), timeoutMs);
        if (outcome === 'error') actions.push('revalidate-error');
        else if (outcome === 'timeout') actions.push('revalidate-timeout');
        else actions.push('revalidated');
    }

    return actions;
}

export function browserRefreshEnv() {
    return {
        serviceWorker: typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined,
        fetch: typeof fetch === 'function' ? fetch.bind(globalThis) : undefined,
        href: typeof location !== 'undefined' ? location.href : '',
    };
}
