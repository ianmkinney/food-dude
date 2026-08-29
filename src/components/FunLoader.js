import React, { useEffect, useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    Animated,
    Platform,
} from 'react-native';
import Reanimated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { getSurfaceStyle, getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';

const MESSAGES = [
    "Firing up the grill...",
    "Scanning for flavor...",
    "Chopping up the pixels...",
    "Sautéing the data...",
    "Seasoning with AI magic...",
    "Taste testing...",
    "Plating up your recipe...",
    "Adding the secret sauce...",
    "Checking for burnt bits...",
    "Garnishing with code...",
];

const FunLoader = ({ visible, progress: externalProgress }) => {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const reduceMotion = useReducedMotion();
    const [messageIndex, setMessageIndex] = useState(0);
    const internalProgress = useRef(new Animated.Value(0)).current;
    const progress = externalProgress !== undefined ? externalProgress : internalProgress;
    const animationRef = useRef(null);
    const iconScale = useSharedValue(1);
    const iconRotate = useSharedValue(0);
    const shimmer = useSharedValue(-1);

    useEffect(() => {
        if (!visible) {
            return;
        }

        if (reduceMotion) {
            iconScale.value = 1;
            iconRotate.value = 0;
            shimmer.value = -1;
            return;
        }

        iconScale.value = withRepeat(
            withSequence(
                withTiming(1.12, { duration: 520, easing: Easing.out(Easing.quad) }),
                withTiming(1, { duration: 520, easing: Easing.in(Easing.quad) })
            ),
            -1,
            false
        );
        iconRotate.value = withRepeat(
            withSequence(
                withTiming(-8, { duration: 480 }),
                withTiming(8, { duration: 480 })
            ),
            -1,
            true
        );
        shimmer.value = withRepeat(
            withTiming(1, { duration: 1400, easing: Easing.linear }),
            -1,
            false
        );
    }, [visible, reduceMotion, iconRotate, iconScale, shimmer]);

    useEffect(() => {
        if (visible) {
            setMessageIndex(0);
            if (!externalProgress) {
                internalProgress.setValue(0);
            }

            if (!externalProgress) {
                animationRef.current = Animated.timing(internalProgress, {
                    toValue: 0.95,
                    duration: 30000,
                    useNativeDriver: false,
                });
                animationRef.current.start();
            }

            const interval = setInterval(() => {
                setMessageIndex((prev) => (prev + 1) % MESSAGES.length);
            }, reduceMotion ? 4000 : 1500);

            return () => {
                clearInterval(interval);
                if (animationRef.current) {
                    animationRef.current.stop();
                }
            };
        }

        if (!externalProgress) {
            Animated.timing(internalProgress, {
                toValue: 1,
                duration: reduceMotion ? 0 : 300,
                useNativeDriver: false,
            }).start();
        }
    }, [visible, externalProgress, reduceMotion]);

    const iconStyle = useAnimatedStyle(() => ({
        transform: [
            { scale: iconScale.value },
            { rotate: `${iconRotate.value}deg` },
        ],
    }));

    const shimmerStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: shimmer.value * 220 }],
        opacity: reduceMotion ? 0 : 0.45,
    }));

    if (!visible) return null;

    const width = progress.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%'],
    });

    const cardStyle = getSurfaceStyle({ ...theme, platform: Platform.OS }, 'elevated');

    return (
        <Modal transparent animationType={reduceMotion ? 'none' : 'fade'} visible={visible}>
            <View style={[styles.overlay, { backgroundColor: theme.colors.overlay }]}>
                <View style={[styles.container, cardStyle, { backgroundColor: theme.colors.surfaceElevated }]}>
                    <View style={[styles.iconHalo, { backgroundColor: theme.primary[100] }]}>
                        <Reanimated.View style={iconStyle}>
                            <Ionicons name="restaurant" size={40} color={theme.primary[500]} />
                        </Reanimated.View>
                    </View>

                    <Text style={[styles.message, { color: theme.colors.text.primary }]}>
                        {MESSAGES[messageIndex]}
                    </Text>

                    <View style={[styles.progressTrack, { backgroundColor: theme.colors.surfaceMuted }]}>
                        <Animated.View
                            style={[
                                styles.progressBar,
                                {
                                    backgroundColor: theme.primary[500],
                                    width: width,
                                },
                            ]}
                        />
                        <Reanimated.View
                            pointerEvents="none"
                            style={[styles.shimmer, shimmerStyle, { backgroundColor: '#FFFFFF' }]}
                        />
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    container: {
        width: '100%',
        maxWidth: 340,
        padding: 28,
        alignItems: 'center',
    },
    iconHalo: {
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    message: {
        fontSize: 18,
        fontWeight: '600',
        textAlign: 'center',
        marginBottom: 24,
        minHeight: 24,
    },
    progressTrack: {
        width: '100%',
        height: 10,
        borderRadius: 8,
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        borderRadius: 8,
    },
    shimmer: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 48,
        borderRadius: 8,
    },
});

export default FunLoader;
