/** Home-indicator height on current iPhones. Larger env() values are phantom Safari chrome. */
export const HOME_INDICATOR_MAX = 34;

/**
 * One bottom inset for the tab bar.
 * Safari tabs keep the old `max(inset, 8)` pad.
 * The installed app must not use a raw `env(safe-area-inset-bottom)` that iOS
 * reports as ~100px (the missing browser toolbar) on top of the shell.
 *
 * @param {number} [reportedInset] value from safe-area context
 * @param {boolean} [standalone]
 * @returns {number}
 */
export function tabBarBottomInset(reportedInset = 0, standalone = false) {
    const inset = Number.isFinite(Number(reportedInset)) ? Number(reportedInset) : 0;
    if (!standalone) return Math.max(inset, 8);
    const capped = Math.min(Math.max(inset, 0), HOME_INDICATOR_MAX);
    return Math.max(capped, 8);
}
