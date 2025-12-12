import React, { useEffect, useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';

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
    const [messageIndex, setMessageIndex] = useState(0);
    const internalProgress = useRef(new Animated.Value(0)).current;
    const progress = externalProgress !== undefined ? externalProgress : internalProgress;
    const animationRef = useRef(null);

    useEffect(() => {
        if (visible) {
            // Reset state
            setMessageIndex(0);
            if (!externalProgress) {
                internalProgress.setValue(0);
            }

            // If no external progress provided, use simulated progress (slower, more realistic)
            if (!externalProgress) {
                // Animate progress bar (simulated 30s load, but will complete when visible becomes false)
                animationRef.current = Animated.timing(internalProgress, {
                    toValue: 0.95, // Stop at 95% to allow completion when done
                    duration: 30000,
                    useNativeDriver: false,
                });
                animationRef.current.start();
            }

            // Cycle messages
            const interval = setInterval(() => {
                setMessageIndex((prev) => (prev + 1) % MESSAGES.length);
            }, 1500);

            return () => {
                clearInterval(interval);
                if (animationRef.current) {
                    animationRef.current.stop();
                }
            };
        } else {
            // When hiding, complete the progress animation quickly
            if (!externalProgress) {
                Animated.timing(internalProgress, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: false,
                }).start();
            }
        }
    }, [visible, externalProgress]);

    if (!visible) return null;

    const width = progress.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%'],
    });

    return (
        <Modal transparent animationType="fade" visible={visible}>
            <View style={styles.overlay}>
                <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
                    <Ionicons name="restaurant" size={48} color={theme.primary[500]} style={styles.icon} />

                    <Text style={[styles.message, { color: theme.colors.text.primary }]}>
                        {MESSAGES[messageIndex]}
                    </Text>

                    <View style={[styles.progressTrack, { backgroundColor: theme.colors.border }]}>
                        <Animated.View
                            style={[
                                styles.progressBar,
                                {
                                    backgroundColor: theme.primary[500],
                                    width: width,
                                }
                            ]}
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
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    container: {
        width: '100%',
        maxWidth: 340,
        padding: 24,
        borderRadius: 16,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 5,
    },
    icon: {
        marginBottom: 16,
    },
    message: {
        fontSize: 18,
        fontWeight: '600',
        textAlign: 'center',
        marginBottom: 24,
        height: 24, // Fixed height to prevent jumping
    },
    progressTrack: {
        width: '100%',
        height: 8,
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        borderRadius: 4,
    },
});

export default FunLoader;
