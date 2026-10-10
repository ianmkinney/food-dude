import React, { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
    FadeOut,
    LinearTransition,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { motion } from '../theme';
import { EASE_OUT, SPRING, riseIn, useReducedMotion } from '../motion';

const DELETE_WIDTH = 88;
const rowLayout = LinearTransition.duration(motion.duration.slow).easing(EASE_OUT);

function DeleteReveal({ drag, color }) {
    const style = useAnimatedStyle(() => {
        const progress = Math.min(1, -drag.value / DELETE_WIDTH);
        return {
            opacity: interpolate(progress, [0, 0.3, 1], [0, 1, 1]),
            transform: [{ scale: interpolate(progress, [0, 1], [0.7, 1]) }],
        };
    });
    return (
        <View style={[styles.reveal, { backgroundColor: color }]}>
            <Animated.View style={[styles.revealInner, style]}>
                <Ionicons name="trash" size={20} color="#FFFFFF" />
                <Text style={styles.revealText}>Delete</Text>
            </Animated.View>
        </View>
    );
}

/**
 * One grocery item. Checking it pops the checkbox and draws a line through the
 * name; the parent then moves it to the Done group. Swipe left to delete.
 */
export default function GroceryRow({ item, index, theme, onToggle, onDelete }) {
    const reduce = useReducedMotion();
    const checked = !!item.is_checked;
    const pop = useSharedValue(1);
    const strike = useSharedValue(checked ? 1 : 0);
    const first = useRef(true);
    const swipeRef = useRef(null);

    useEffect(() => {
        if (first.current) {
            first.current = false;
            return;
        }
        if (reduce) {
            strike.value = checked ? 1 : 0;
            return;
        }
        strike.value = withTiming(checked ? 1 : 0, { duration: motion.duration.base, easing: EASE_OUT });
        if (checked) {
            pop.value = withSequence(withTiming(0.7, { duration: 80 }), withSpring(1, { ...SPRING, stiffness: 600, damping: 18 }));
        }
    }, [checked, reduce, pop, strike]);

    const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
    const strikeStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: strike.value }] }));
    const c = theme.colors;
    const quantity = item.quantity ? `${item.quantity} ${item.unit || ''}`.trim() : '';

    return (
        <Animated.View
            entering={riseIn(index, reduce)}
            exiting={reduce ? undefined : FadeOut.duration(motion.duration.fast)}
            layout={reduce ? undefined : rowLayout}
            style={styles.wrap}
        >
            <ReanimatedSwipeable
                ref={swipeRef}
                friction={1.6}
                rightThreshold={DELETE_WIDTH * 0.6}
                overshootRight={false}
                renderRightActions={(_progress, drag) => <DeleteReveal drag={drag} color={c.error} />}
                onSwipeableOpen={(direction) => {
                    if (direction === 'left') onDelete(item);
                }}
                containerStyle={styles.swipeContainer}
            >
                <Pressable
                    onPress={() => onToggle(item)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={[item.name, quantity].filter(Boolean).join(', ')}
                    accessibilityActions={[{ name: 'delete', label: 'Delete' }]}
                    onAccessibilityAction={(e) => e.nativeEvent.actionName === 'delete' && onDelete(item)}
                    style={[styles.row, { backgroundColor: c.surfaceElevated, borderColor: c.border }]}
                >
                    <Animated.View style={checkStyle}>
                        <Ionicons
                            name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                            size={26}
                            color={checked ? theme.primary[500] : c.text.tertiary}
                        />
                    </Animated.View>
                    <View style={styles.info}>
                        <View style={styles.nameWrap}>
                            <Text style={[styles.name, { color: checked ? c.text.tertiary : c.text.primary }]} numberOfLines={1}>
                                {item.name}
                            </Text>
                            <Animated.View pointerEvents="none" style={[styles.strike, { backgroundColor: c.text.tertiary }, strikeStyle]} />
                        </View>
                        {!!quantity && <Text style={[styles.meta, { color: c.text.secondary }]}>{quantity}</Text>}
                        {!!item.recipe_name && (
                            <Text style={[styles.meta, { color: theme.primary[500] }]} numberOfLines={1}>
                                For: {item.recipe_name}
                            </Text>
                        )}
                    </View>
                    {Platform.OS === 'web' && (
                        <Pressable
                            onPress={() => onDelete(item)}
                            accessibilityRole="button"
                            accessibilityLabel={`Delete ${item.name}`}
                            style={styles.webDelete}
                        >
                            <Ionicons name="close" size={18} color={c.text.tertiary} />
                        </Pressable>
                    )}
                </Pressable>
            </ReanimatedSwipeable>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrap: { marginBottom: 8 },
    swipeContainer: { borderRadius: 16, overflow: 'hidden' },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        minHeight: 64,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderWidth: 1,
        borderRadius: 16,
    },
    info: { flex: 1, gap: 2 },
    nameWrap: { alignSelf: 'flex-start', maxWidth: '100%', justifyContent: 'center' },
    name: { fontSize: 16, fontWeight: '600' },
    strike: { position: 'absolute', left: 0, right: 0, height: 2, top: '50%', marginTop: -1, transformOrigin: 'left' },
    meta: { fontSize: 13 },
    webDelete: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -12 },
    reveal: { width: DELETE_WIDTH, alignItems: 'center', justifyContent: 'center' },
    revealInner: { alignItems: 'center', gap: 2 },
    revealText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
