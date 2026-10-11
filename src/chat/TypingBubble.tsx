import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../motion';

type Props = { background: string; border: string; dot: string; label: string };

/** Three-dot "typing" bubble shown while the assistant is working. */
export default function TypingBubble({ background, border, dot, label }: Props) {
    const reduceMotion = useReducedMotion();
    const phase = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (reduceMotion) return undefined;
        const loop = Animated.loop(
            Animated.timing(phase, {
                toValue: 1,
                duration: 1200,
                easing: Easing.linear,
                useNativeDriver: Platform.OS !== 'web',
            })
        );
        loop.start();
        return () => loop.stop();
    }, [phase, reduceMotion]);

    return (
        <View
            style={[styles.bubble, { backgroundColor: background, borderColor: border }]}
            accessibilityRole="text"
            accessibilityLabel={label}
            accessibilityLiveRegion="polite"
            aria-live="polite"
        >
            {[0, 1, 2].map((i) => {
                const start = i * 0.2;
                const opacity = reduceMotion
                    ? 0.6
                    : phase.interpolate({
                          inputRange: [0, start, start + 0.2, start + 0.4, 1],
                          outputRange: [0.3, 0.3, 1, 0.3, 0.3],
                      });
                const translateY = reduceMotion
                    ? 0
                    : phase.interpolate({
                          inputRange: [0, start, start + 0.2, start + 0.4, 1],
                          outputRange: [0, 0, -3, 0, 0],
                      });
                return <Animated.View key={i} style={[styles.dot, { backgroundColor: dot, opacity, transform: [{ translateY }] }]} />;
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    bubble: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 5,
        borderWidth: 1,
        borderRadius: 18,
        borderBottomLeftRadius: 6,
        paddingHorizontal: 14,
        paddingVertical: 13,
    },
    dot: { width: 8, height: 8, borderRadius: 4 },
});
