import { useCallback } from 'react';

// Placeholder for the animated Sous onboarding tour. The tour itself is on hold
// until its copy and claims clear legal review, so this hook never asks to show
// anything yet. Screens call it now so the tour can be switched on in one place.

export const ONBOARDING_TOUR_ENABLED = false;

export type OnboardingTour = {
    shouldShow: boolean;
    markSeen: () => Promise<void>;
};

export function useOnboardingTour(): OnboardingTour {
    const markSeen = useCallback(async () => {}, []);
    return { shouldShow: ONBOARDING_TOUR_ENABLED, markSeen };
}
