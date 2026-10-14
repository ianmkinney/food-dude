/** Registered on the web OAuth client. No trailing slash. See docs/PLATFORM_AI_SETUP.md. */
export const PRODUCTION_GOOGLE_REDIRECT_URI = 'https://amplifood.vercel.app/auth/google-callback';
export const GOOGLE_REDIRECT_PATH = '/auth/google-callback';

/**
 * @param {string} origin `window.location.origin`
 * @returns {string} exact redirect_uri sent to Google
 */
export function googleRedirectUri(origin) {
    const base = String(origin || '').trim().replace(/\/+$/, '');
    return `${base}${GOOGLE_REDIRECT_PATH}`;
}

/**
 * Home-screen / installed PWA. iOS sets `navigator.standalone`; other browsers
 * expose `display-mode`.
 *
 * @param {{ navigatorStandalone?: boolean, displayMode?: string }} [env]
 */
export function isStandaloneWebApp(env = {}) {
    if (env.navigatorStandalone) return true;
    return env.displayMode === 'standalone' || env.displayMode === 'fullscreen';
}

/**
 * Full-page redirect, not a popup.
 * Popup is blocked or ignored in Safari (the open is not a user gesture, or
 * the browser drops it) and in an installed home-screen app the popup becomes
 * a navigation that Google answers with its own error page.
 *
 * @param {string} [userAgent]
 * @param {number} [maxTouchPoints]
 * @param {{ standalone?: boolean }} [options]
 */
export function shouldUseSameTabGoogleRedirect(userAgent = '', maxTouchPoints = 0, options = {}) {
    if (options?.standalone) return true;
    const ua = String(userAgent || '');
    if (/iPhone|iPod|iPad|CriOS|FxiOS|EdgiOS/i.test(ua)) return true;
    if (/Macintosh/i.test(ua) && Number(maxTouchPoints) > 1) return true;
    // Desktop Safari includes "Safari" and not Chrome/Edge/Firefox.
    if (/Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg\/|FxiOS|Firefox|Android/i.test(ua)) return true;
    return false;
}

/**
 * Text for an in-app alert. `access_denied` stays the sentinel `cancelled`
 * so a deliberate dismiss does not look like a failure.
 *
 * @param {string} [code]
 * @param {string} [description]
 * @param {string} [redirectUri]
 */
export function googleSignInErrorMessage(code, description, redirectUri) {
    const sent = redirectUri || PRODUCTION_GOOGLE_REDIRECT_URI;
    if (code === 'access_denied') return 'cancelled';
    if (code === 'redirect_uri_mismatch' || code === 'origin_mismatch') {
        return `Google rejected this redirect URI: ${sent}. Add that exact string under Authorized redirect URIs for the web client. /auth/google-callback.html is a different URI.`;
    }
    if (code === 'disallowed_useragent') {
        return 'Google blocked sign-in in this browser. The installed home-screen app and in-app browsers often get this. Open amplifood.vercel.app in a Safari tab and sign in there.';
    }
    if (code === 'incomplete') {
        return `Google didn't finish sign-in. The redirect URI sent was ${sent}. Add that exact string under Authorized redirect URIs if Google showed Error 400: redirect_uri_mismatch. In the installed app, Google may also block the browser.`;
    }
    const detail = typeof description === 'string' ? description.trim() : '';
    if (detail) return detail;
    if (code) return `Google sign-in failed (${code}).`;
    return 'Google sign-in failed.';
}
