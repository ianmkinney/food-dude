import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion as useInitialReducedMotion } from 'react-native-reanimated';

/**
 * OS Reduce Motion (native) or prefers-reduced-motion (web). Starts from the
 * value Reanimated read at launch so the first frame is already correct, then
 * follows changes.
 */
export const useReducedMotion = () => {
    const initial = useInitialReducedMotion();
    const [reduceMotion, setReduceMotion] = useState(initial);

    useEffect(() => {
        let mounted = true;

        const apply = (value) => {
            if (mounted) {
                setReduceMotion(Boolean(value));
            }
        };

        if (typeof AccessibilityInfo.isReduceMotionEnabled === 'function') {
            AccessibilityInfo.isReduceMotionEnabled()
                .then(apply)
                .catch(() => {});
        }

        const subscription = AccessibilityInfo.addEventListener?.(
            'reduceMotionChanged',
            apply
        );

        return () => {
            mounted = false;
            if (subscription && typeof subscription.remove === 'function') {
                subscription.remove();
            }
        };
    }, []);

    return reduceMotion;
};

export default useReducedMotion;
