import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Ionicons } from '@expo/vector-icons';
import { getSurfaceStyle, motion } from '../theme';
import { timing, useEnterStyle, useReducedMotion } from '../motion';

const DELETE_WIDTH = 88;

function DeleteAction({ theme }) {
    return (
        <View style={[styles.deleteAction, { backgroundColor: theme.colors.error }]}>
            <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
            <Text style={styles.deleteText}>Delete</Text>
        </View>
    );
}

/**
 * One grocery item. Checking it pops the checkbox and draws a strikethrough
 * across the name; the parent then moves it into the Done group, where it
 * remounts and slides down into place. Swipe left to reveal Delete.
 */
export default function GroceryRow(props) {
    const { item, theme, index = 0, checked, onToggle, onDelete, enterFrom = 'below' } = props;
    const reduceMotion = useReducedMotion();
    const surface = getSurfaceStyle(theme, 'card');
    const enterStyle = useEnterStyle({ index, distance: enterFrom === 'above' ? -12 : motion.rise });

    const strike = useSharedValue(checked ? 1 : 0);
    const pop = useSharedValue(1);
    const first = useRef(true);

    useEffect(() => {
        if (first.current) {
            first.current = false;
            return;
        }
        if (reduceMotion) {
            strike.value = checked ? 1 : 0;
            return;
        }
        strike.value = withTiming(checked ? 1 : 0, timing(motion.duration.base));
        if (checked) {
            pop.value = withSequence(
                withTiming(1.25, { duration: motion.duration.fast }),
                withSpring(1, motion.spring.base),
            );
        }
        // Shared values are stable; only `checked` drives this.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [checked, reduceMotion]);

    const strikeStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: strike.value }] }));
    const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

    const quantity = item.quantity ? `${item.quantity} ${item.unit || ''}`.trim() : '';

    return (
        <Animated.View style={[styles.wrap, enterStyle]}>
            <ReanimatedSwipeable
                friction={1.6}
                rightThreshold={DELETE_WIDTH * 0.6}
                overshootRight={false}
                renderRightActions={() => <DeleteAction theme={theme} />}
                onSwipeableOpen={() => onDelete(item)}
                containerStyle={styles.swipe}
            >
                <Pressable
                    onPress={() => onToggle(item)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={quantity ? `${item.name}, ${quantity}` : item.name}
                    accessibilityActions={[{ name: 'delete', label: 'Delete item' }]}
                    onAccessibilityAction={(e) => e.nativeEvent.actionName === 'delete' && onDelete(item)}
                    style={[styles.row, surface]}
                >
                    <Animated.View style={popStyle}>
                        <Ionicons
                            name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                            size={28}
                            color={checked ? theme.primary[500] : theme.colors.text.tertiary}
                        />
                    </Animated.View>
                    <View style={styles.info}>
                        <View style={styles.nameWrap}>
                            <Text
                                style={[
                                    styles.name,
                                    { color: checked ? theme.colors.text.tertiary : theme.colors.text.primary },
                                ]}
                            >
                                {item.name}
                            </Text>
                            <Animated.View
                                pointerEvents="none"
                                style={[styles.strike, { backgroundColor: theme.colors.text.tertiary }, strikeStyle]}
                            />
                        </View>
                        {!!quantity && (
                            <Text style={[styles.meta, { color: theme.colors.text.secondary }]}>{quantity}</Text>
                        )}
                        {!!item.recipe_name && (
                            <Text style={[styles.recipe, { color: theme.primary[500] }]} numberOfLines={1}>
                                For: {item.recipe_name}
                            </Text>
                        )}
                    </View>
                </Pressable>
            </ReanimatedSwipeable>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrap: { marginBottom: 8 },
    swipe: { borderRadius: 16, overflow: 'hidden' },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        minHeight: 56,
        borderRadius: 16,
    },
    info: { flex: 1, gap: 2 },
    nameWrap: { alignSelf: 'flex-start', justifyContent: 'center' },
    name: { fontSize: 16, fontWeight: '600' },
    strike: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 2,
        top: '50%',
        marginTop: -1,
        transformOrigin: 'left',
    },
    meta: { fontSize: 14 },
    recipe: { fontSize: 12, fontWeight: '500' },
    deleteAction: {
        width: DELETE_WIDTH,
        borderTopRightRadius: 16,
        borderBottomRightRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
    },
    deleteText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
