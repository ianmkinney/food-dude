import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    fabDragBounds,
    listClearance,
    readFabPosition,
    subscribeFabPlacement,
} from './fabPlacement';

export {
    FAB_ABOVE_TAB_MARGIN,
    FAB_GAP,
    FAB_LONG_PRESS_MS,
    FAB_MARGIN_X,
    FAB_SIZE,
} from './fabPlacement';

export function useFabPosition() {
    const [pos, setPos] = useState(readFabPosition);
    useEffect(() => subscribeFabPlacement(setPos), []);
    useFocusEffect(
        useCallback(() => {
            setPos(readFabPosition());
        }, [])
    );
    return pos;
}

/**
 * Shared placement plus list insets so a right-side (or dragged) FAB
 * does not cover pantry delete/edit or grocery swipe actions.
 * @param {number} fabCount
 * @param {{ width?: number, height?: number }} frame screen box below the header
 */
export function useFloatingActionLayout(fabCount = 1, frame = { width: 0, height: 0 }) {
    const norm = useFabPosition();
    const insets = useSafeAreaInsets();
    const listInset = useMemo(() => {
        const bounds = fabDragBounds({
            width: frame.width || 390,
            height: frame.height || 700,
            insetLeft: insets.left,
            insetRight: insets.right,
            insetTop: 0,
        });
        return listClearance({ norm, bounds, fabCount });
    }, [norm, frame.width, frame.height, fabCount, insets.left, insets.right]);
    return { listInset, norm };
}
