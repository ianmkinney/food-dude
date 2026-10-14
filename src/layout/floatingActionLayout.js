import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isWebStandalone } from './useLayoutMode';
import { tabBarBottomInset } from './tabBarInset';

export const FAB_SIZE = 56;
export const FAB_GAP = 12;
export const FAB_MARGIN_X = 20;
/** Matches AppTabBar: paddingTop 6 + minHeight 52. */
export const TAB_BAR_MAIN_HEIGHT = 58;
export const FAB_ABOVE_TAB_MARGIN = 12;

export function getFloatingActionBottom(insetsBottom = 0) {
    return Math.max(insetsBottom, 8) + TAB_BAR_MAIN_HEIGHT + FAB_ABOVE_TAB_MARGIN;
}

export function getListPaddingBottomForFAB(insetsBottom = 0, fabCount = 1) {
    const stack =
        fabCount > 1 ? FAB_SIZE * fabCount + FAB_GAP * (fabCount - 1) : FAB_SIZE;
    return getFloatingActionBottom(insetsBottom) + stack + 24;
}

/**
 * Mobile floating actions: bottom-left, above the tab bar.
 * @param {number} fabCount 1 or 2 stacked horizontally in the container
 */
export function useFloatingActionLayout(fabCount = 1) {
    const insets = useSafeAreaInsets();
    const inset = tabBarBottomInset(insets.bottom, Platform.OS === 'web' && isWebStandalone());
    const bottom = getFloatingActionBottom(inset);
    const containerStyle = {
        position: 'absolute',
        left: FAB_MARGIN_X,
        bottom,
        flexDirection: 'row',
        gap: FAB_GAP,
        alignItems: 'center',
        zIndex: 10,
    };
    const listPaddingBottom = getListPaddingBottomForFAB(inset, fabCount);
    return { containerStyle, listPaddingBottom, bottom };
}
