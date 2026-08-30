import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme, motion } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import AnimatedPressable from './AnimatedPressable';

const FOOD_EMOJIS = ['🍕', '🍔', '🌮', '🥗', '🍣', '🍩', '🍪', '🥑', '🥓', '🥞'];

const HeaderTitle = ({ tintColor, showPartyButton = true, showAccountButton = false }) => {
    const [emojiIndex, setEmojiIndex] = useState(0);
    const fade = useSharedValue(1);
    const navigation = useNavigation();
    const { isDark, toggleTheme } = useTheme();
    const theme = getTheme(isDark);
    const reduceMotion = useReducedMotion();
    const iconColor = tintColor || theme.colors.text.primary;

    useEffect(() => {
        if (reduceMotion) {
            return;
        }

        const bumpEmoji = () => {
            setEmojiIndex((prevIndex) => (prevIndex + 1) % FOOD_EMOJIS.length);
        };

        const interval = setInterval(() => {
            fade.value = withTiming(0, { duration: motion.duration.fast }, (finished) => {
                if (finished) {
                    runOnJS(bumpEmoji)();
                    fade.value = withTiming(1, { duration: motion.duration.fast });
                }
            });
        }, 2000);

        return () => clearInterval(interval);
    }, [fade, reduceMotion]);

    const emojiStyle = useAnimatedStyle(() => ({
        opacity: fade.value,
        transform: [{ scale: 0.92 + fade.value * 0.08 }],
    }));

    return (
        <View style={styles.container}>
            {showPartyButton && (
                <AnimatedPressable
                    style={[styles.headerButton, styles.leftButton]}
                    onPress={() => navigation.navigate('Party')}
                    accessibilityLabel="Open party"
                    scaleTo={motion.scale.pressHard}
                >
                    <Ionicons name="people" size={24} color={iconColor} />
                </AnimatedPressable>
            )}
            <View style={styles.titleContainer}>
                <Animated.Text style={[styles.emoji, emojiStyle]}>
                    {FOOD_EMOJIS[emojiIndex]}
                </Animated.Text>
                <Text style={[styles.title, { color: tintColor || theme.colors.text.primary }]}>
                    {' '}Food Dude{' '}
                </Text>
                <Text style={styles.emoji}>😎</Text>
            </View>
            {showAccountButton && (
                <>
                    <AnimatedPressable
                        style={[styles.headerButton, styles.rightButton, { right: -60 }]}
                        onPress={toggleTheme}
                        accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                        scaleTo={motion.scale.pressHard}
                    >
                        <Ionicons
                            name={isDark ? 'sunny' : 'moon'}
                            size={24}
                            color={iconColor}
                        />
                    </AnimatedPressable>
                    <AnimatedPressable
                        style={[styles.headerButton, styles.rightButton]}
                        onPress={() => navigation.navigate('Account')}
                        accessibilityLabel="Open account"
                        scaleTo={motion.scale.pressHard}
                    >
                        <Ionicons name="person" size={24} color={iconColor} />
                    </AnimatedPressable>
                </>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        position: 'relative',
    },
    titleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    emoji: {
        fontSize: 20,
    },
    headerButton: {
        position: 'absolute',
        padding: 4,
        zIndex: 1,
    },
    leftButton: {
        left: -20,
    },
    rightButton: {
        right: -20,
    },
});

export default HeaderTitle;
