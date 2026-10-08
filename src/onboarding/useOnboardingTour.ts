// The first-run onboarding and tour live in OnboardingGate (App.js); Settings →
// AI & privacy → Replay tour restarts them via replayOnboarding().
export { replayOnboarding } from './onboardingStore';

export function useOnboardingTour() {
    return { shouldShow: false };
}
