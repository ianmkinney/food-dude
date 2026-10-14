/** Display modes a home-screen web app may report. iOS often says fullscreen for a standalone manifest; Chrome's Add to Home Screen can say minimal-ui. */
export const STANDALONE_DISPLAY_MODES = ['standalone', 'fullscreen', 'minimal-ui'];

/** A missing Safari toolbar is about 100px. A real keyboard is larger than this. */
export const KEYBOARD_OPEN_GAP = 150;

/** screen.height on a desktop monitor is far taller than the page. Ignore those. */
export const SCREEN_HEIGHT_SLACK = 160;

function positive(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {boolean | undefined} navStandalone navigator.standalone (Safari legacy)
 * @param {(mode: string) => boolean} [matches]
 */
export function isStandaloneDisplay(navStandalone, matches) {
    if (navStandalone === true) return true;
    if (typeof matches !== 'function') return false;
    return STANDALONE_DISPLAY_MODES.some((mode) => {
        try {
            return matches(mode) === true;
        } catch {
            return false;
        }
    });
}

/**
 * Height of the installed-app shell.
 * visualViewport and 100dvh are ~100px short on an iOS home-screen app
 * (they still subtract the Safari toolbar / safe area). 100lvh and screen.height
 * are the full screen. A real keyboard still uses the short visual viewport.
 *
 * @param {{ viewportHeight?: number, largeHeight?: number, screenHeight?: number, innerHeight?: number }} metrics
 */
export function standaloneShellHeight({
    viewportHeight = 0,
    largeHeight = 0,
    screenHeight = 0,
    innerHeight = 0,
} = {}) {
    const vv = positive(viewportHeight);
    const large = positive(largeHeight);
    const inner = positive(innerHeight);
    const screen = positive(screenHeight);
    const base = Math.max(large, inner, vv);
    const screenUsable = screen > 0 && Math.abs(screen - Math.max(large, inner, 1)) <= SCREEN_HEIGHT_SLACK;
    const full = Math.max(base, screenUsable ? screen : 0);
    if (vv > 0 && full - vv > KEYBOARD_OPEN_GAP) return Math.round(vv);
    return Math.round(full || vv || inner || large);
}

/** Probe 100lvh (falling back to 100vh). */
export function measureLargeViewportHeight(doc) {
    const root = doc?.documentElement;
    if (!root) return 0;
    const probe = doc.createElement('div');
    probe.setAttribute('data-af-lvh', '');
    probe.style.cssText =
        'position:fixed;left:0;top:0;height:100vh;height:100lvh;width:0;visibility:hidden;pointer-events:none;';
    root.appendChild(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return positive(height);
}

/**
 * Top inset for the home-screen status bar.
 * Chrome's iOS webview often reports 0 for env(safe-area-inset-top) while
 * viewport-fit=cover still draws the header under the clock.
 *
 * @param {number} [reported]
 * @param {number} [screenHeight]
 */
export function standaloneTopInset(reported = 0, screenHeight = 0) {
    const inset = positive(reported);
    if (inset >= 20) return Math.round(inset);
    const h = positive(screenHeight);
    const fallback = h >= 850 ? 59 : h >= 800 ? 47 : h > 0 ? 20 : 47;
    return Math.max(Math.round(inset), fallback);
}
