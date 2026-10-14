/**
 * iPhone/iPad browsers (including iPadOS desktop UA and Chrome/Firefox/Edge on iOS)
 * cannot finish Google's implicit flow in a popup: COOP clears window.opener,
 * sessionStorage is per-tab, and window.close() fails after the cross-site hop.
 * The first tap must navigate the same tab.
 *
 * @param {string} [userAgent]
 * @param {number} [maxTouchPoints]
 */
export function shouldUseSameTabGoogleRedirect(userAgent = '', maxTouchPoints = 0) {
    const ua = String(userAgent || '');
    if (/iPhone|iPod|iPad|CriOS|FxiOS|EdgiOS/i.test(ua)) return true;
    if (/Macintosh/i.test(ua) && Number(maxTouchPoints) > 1) return true;
    return false;
}
