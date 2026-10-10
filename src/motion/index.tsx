import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, Keyframe, cubicBezier } from 'react-native-reanimated';
import { motion } from '../theme';
import { useReducedMotion } from '../hooks/useReducedMotion';

export { useReducedMotion };

const [x1, y1, x2, y2] = motion.easeOut;
export const EASE_OUT = Easing.bezier(x1, y1, x2, y2);
export const CSS_EASE_OUT = cubicBezier(x1, y1, x2, y2);
export const SPRING = motion.spring.default;

/** Entering animation: rise 8px and fade in, staggered by list position. */
export const riseIn = (index = 0, reduce = false, rise: number = motion.rise) =>
    reduce
        ? undefined
        : new Keyframe({
              0: { opacity: 0, transform: [{ translateY: rise }] },
              100: { opacity: 1, transform: [{ translateY: 0 }], easing: EASE_OUT },
          })
              .duration(motion.duration.base)
              .delay(Math.min(index, 10) * motion.stagger);

/** Spring up from below, for chat bubbles arriving from the composer. */
export const springUp = (reduce = false) =>
    reduce
        ? undefined
        : new Keyframe({
              0: { opacity: 0, transform: [{ translateY: 16 }, { scale: 0.98 }] },
              100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }], easing: EASE_OUT },
          }).duration(motion.duration.slow);

type Children = { children?: React.ReactNode; style?: StyleProp<ViewStyle> };

export function Rise({ index = 0, children, style }: Children & { index?: number }) {
    const reduce = useReducedMotion();
    return (
        <Animated.View entering={riseIn(index, reduce)} style={style}>
            {children}
        </Animated.View>
    );
}

// CSS keyframe animations run on the compositor on web and on the UI thread
// natively, so idle loops never touch the JS thread.
const breathe = {
    from: { transform: [{ scale: 1 }] },
    to: { transform: [{ scale: 1.04 }] },
};
const pulseFast = {
    from: { transform: [{ scale: 0.97 }], opacity: 0.85 },
    to: { transform: [{ scale: 1.06 }], opacity: 1 },
};

/** Ampi's idle breath (3s), or a quicker pulse while thinking. */
export function Breathe({ thinking = false, children, style }: Children & { thinking?: boolean }) {
    const reduce = useReducedMotion();
    const animation = reduce
        ? null
        : {
              animationName: thinking ? pulseFast : breathe,
              animationDuration: thinking ? 450 : 1500,
              animationIterationCount: 'infinite' as const,
              animationDirection: 'alternate' as const,
              animationTimingFunction: 'ease-in-out' as const,
          };
    return <Animated.View style={[style, animation as object]}>{children}</Animated.View>;
}

const sway = {
    '0%': { transform: [{ rotate: '-3deg' }] },
    '50%': { transform: [{ rotate: '3deg' }] },
    '100%': { transform: [{ rotate: '-3deg' }] },
};

/** Slow mascot sway for empty states. */
export function Sway({ children, style }: Children) {
    const reduce = useReducedMotion();
    const animation = reduce
        ? null
        : {
              animationName: sway,
              animationDuration: 3200,
              animationIterationCount: 'infinite' as const,
              animationTimingFunction: 'ease-in-out' as const,
          };
    return <Animated.View style={[style, animation as object]}>{children}</Animated.View>;
}

const pulse = {
    '0%': { opacity: 0.35, transform: [{ scale: 0.92 }] },
    '50%': { opacity: 1, transform: [{ scale: 1.06 }] },
    '100%': { opacity: 1, transform: [{ scale: 1 }] },
};

/** Sound-wave pulse; `times` = how many beats before resting. */
export function Pulse({ times = 1, delay = 0, children, style }: Children & { times?: number | 'infinite'; delay?: number }) {
    const reduce = useReducedMotion();
    const animation = reduce
        ? null
        : {
              animationName: pulse,
              animationDuration: 600,
              animationDelay: delay,
              animationIterationCount: times,
              animationTimingFunction: CSS_EASE_OUT,
              animationFillMode: 'both' as const,
          };
    return <Animated.View style={[style, animation as object]}>{children}</Animated.View>;
}

const strum = {
    '0%': { transform: [{ translateY: 0 }, { scaleY: 1 }], opacity: 0.45 },
    '30%': { transform: [{ translateY: -4 }, { scaleY: 1.15 }], opacity: 1 },
    '60%': { transform: [{ translateY: 1 }, { scaleY: 0.95 }], opacity: 0.8 },
    '100%': { transform: [{ translateY: 0 }, { scaleY: 1 }], opacity: 0.45 },
};

/** Three dots plucked in turn, like strumming across strings. */
export function StrumDots({ color, size = 7 }: { color: string; size?: number }) {
    const reduce = useReducedMotion();
    return (
        <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.7, height: size * 2.4 }}>
            {[0, 1, 2].map((i) => (
                <Animated.View
                    key={i}
                    style={[
                        { width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: reduce ? 0.8 : undefined },
                        reduce
                            ? null
                            : ({
                                  animationName: strum,
                                  animationDuration: 720,
                                  animationDelay: i * 110,
                                  animationIterationCount: 'infinite',
                                  animationTimingFunction: 'ease-out',
                              } as object),
                    ]}
                />
            ))}
        </Animated.View>
    );
}

const shimmer = {
    from: { transform: [{ translateX: '-100%' }] },
    to: { transform: [{ translateX: '260%' }] },
};

/** Placeholder block with a travelling highlight; replaces spinners. */
export function Skeleton({
    width = '100%',
    height = 16,
    radius = 12,
    base,
    highlight,
    style,
}: {
    width?: number | `${number}%`;
    height?: number;
    radius?: number;
    base: string;
    highlight: string;
    style?: StyleProp<ViewStyle>;
}) {
    const reduce = useReducedMotion();
    return (
        <Animated.View
            style={[{ width, height, borderRadius: radius, backgroundColor: base, overflow: 'hidden' }, style]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
        >
            {!reduce && (
                <Animated.View
                    style={
                        {
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: 0,
                            width: '40%',
                            backgroundColor: highlight,
                            animationName: shimmer,
                            animationDuration: 1200,
                            animationIterationCount: 'infinite',
                            animationTimingFunction: 'ease-in-out',
                        } as object
                    }
                />
            )}
        </Animated.View>
    );
}
