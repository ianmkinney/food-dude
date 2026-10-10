// The web startup animation is static HTML/CSS in public/index.html so it plays
// while the JS bundle downloads; the app only reports when it is ready.
export const signalAppReady = () => {
    if (typeof window === 'undefined') return;
    requestAnimationFrame(() => requestAnimationFrame(() => window.__afSplash?.ready?.()));
};

export const hasStartupOverlay = false;

export default function StartupSplash() {
    return null;
}
