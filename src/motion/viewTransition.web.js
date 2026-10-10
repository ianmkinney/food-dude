import { useLayoutEffect, useRef } from 'react';
import { isReducedMotion } from '../hooks/useReducedMotion';

// The View Transitions API snapshots the page, runs the update, then morphs
// any element whose `view-transition-name` appears on both sides. The source
// is named just before the snapshot; the destination names itself on mount
// and resolves the pending update so the browser can take the "after" shot.
let pendingResolve = null;
const named = new Set();

const toElement = (node) => (node && node.style ? node : null);

const clearNames = () => {
    named.forEach((el) => {
        el.style.viewTransitionName = '';
    });
    named.clear();
};

export const supportsViewTransitions = () =>
    typeof document !== 'undefined' && typeof document.startViewTransition === 'function';

/**
 * Run `update` (usually a navigation) as a view transition. `sourceRef` and
 * `name` mark the element that should morph into the destination's
 * `useViewTransitionTarget(name)` element.
 */
export function navigateWithTransition(update, { sourceRef, name } = {}) {
    if (!supportsViewTransitions() || isReducedMotion()) {
        update();
        return;
    }
    clearNames();
    const source = toElement(sourceRef?.current);
    if (source && name) {
        source.style.viewTransitionName = name;
        named.add(source);
    }
    const transition = document.startViewTransition(
        () =>
            new Promise((resolve) => {
                if (source) {
                    source.style.viewTransitionName = '';
                    named.delete(source);
                }
                const timeout = setTimeout(() => {
                    pendingResolve = null;
                    resolve();
                }, 450);
                pendingResolve = () => {
                    clearTimeout(timeout);
                    pendingResolve = null;
                    resolve();
                };
                update();
            })
    );
    transition.finished.finally(clearNames);
}

/**
 * Mark the destination element of a transition started with
 * `navigateWithTransition`. Pass `ready = false` while the element is not
 * rendered yet (data still loading); the transition waits briefly for it.
 */
export function useViewTransitionTarget(name, ready = true) {
    const ref = useRef(null);
    useLayoutEffect(() => {
        if (!pendingResolve || !ready) return;
        const el = toElement(ref.current);
        if (el && name) {
            el.style.viewTransitionName = name;
            named.add(el);
        }
        const resolve = pendingResolve;
        requestAnimationFrame(() => resolve?.());
    }, [name, ready]);
    return ref;
}
