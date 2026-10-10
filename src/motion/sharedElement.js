import { Platform } from 'react-native';

const NAME = 'ampli-shared';
const MAX_WAIT_MS = 400;

const reducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function waitForElement(id) {
    const started = Date.now();
    return new Promise((resolve) => {
        const tick = () => {
            const el = document.getElementById(id);
            if (el || Date.now() - started > MAX_WAIT_MS) resolve(el);
            // Rendering is paused inside a view transition update, so poll
            // with timers rather than animation frames.
            else setTimeout(tick, 16);
        };
        tick();
    });
}

/**
 * Navigate with a shared-element morph on web (View Transitions API): the
 * element with `fromId` grows into the element with `toId` on the next screen.
 * Elsewhere, or without browser support, or under Reduce Motion, it just
 * navigates.
 */
export function navigateShared(navigate, fromId, toId) {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !document.startViewTransition || reducedMotion()) {
        navigate();
        return;
    }
    const from = document.getElementById(fromId);
    if (from) from.style.viewTransitionName = NAME;
    let to = null;
    const transition = document.startViewTransition(async () => {
        if (from) from.style.viewTransitionName = '';
        navigate();
        to = await waitForElement(toId);
        if (to) to.style.viewTransitionName = NAME;
    });
    transition.finished.finally(() => {
        if (to) to.style.viewTransitionName = '';
    });
}
