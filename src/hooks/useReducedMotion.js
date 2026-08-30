import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export const useReducedMotion = () => {
    const [reduceMotion, setReduceMotion] = useState(false);

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
                .catch(() => apply(false));
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
