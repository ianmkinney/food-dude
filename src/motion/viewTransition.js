import { useRef } from 'react';

// Native stacks already animate between screens; there is no View Transitions API.
export const supportsViewTransitions = () => false;

export function navigateWithTransition(update) {
    update();
}

export function useViewTransitionTarget() {
    return useRef(null);
}
