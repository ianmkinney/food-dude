import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';

const TypingIndicator = ({ messageIndex }) => {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const typingMessages = ['💭 Thinking...', '⌨️ Typing...'];
    
    const dot1 = useRef(new Animated.Value(0.3)).current;
    const dot2 = useRef(new Animated.Value(0.3)).current;
    const dot3 = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
        const animateDot = (dot, delay) => {
            return Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(dot, {
                        toValue: 1,
                        duration: 400,
                        useNativeDriver: true,
                    }),
                    Animated.timing(dot, {
                        toValue: 0.3,
                        duration: 400,
                        useNativeDriver: true,
                    }),
                ])
            );
        };

        const animations = [
            animateDot(dot1, 0),
            animateDot(dot2, 200),
            animateDot(dot3, 400),
        ];

        animations.forEach(anim => anim.start());

        return () => {
            animations.forEach(anim => anim.stop());
        };
    }, []);

    return (
        <View
            style={[
                styles.messageBubble,
                styles.assistantBubble,
                { backgroundColor: theme.colors.surface },
            ]}
        >
            <View style={styles.typingContainer}>
                <Text style={[styles.typingText, { color: theme.colors.text.secondary }]}>
                    {typingMessages[messageIndex]}
                </Text>
                <View style={styles.typingDots}>
                    <Animated.View
                        style={[
                            styles.dot,
                            {
                                backgroundColor: theme.colors.text.tertiary,
                                opacity: dot1,
                            },
                        ]}
                    />
                    <Animated.View
                        style={[
                            styles.dot,
                            {
                                backgroundColor: theme.colors.text.tertiary,
                                opacity: dot2,
                            },
                        ]}
                    />
                    <Animated.View
                        style={[
                            styles.dot,
                            {
                                backgroundColor: theme.colors.text.tertiary,
                                opacity: dot3,
                            },
                        ]}
                    />
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    messageBubble: {
        maxWidth: '80%',
        padding: 12,
        borderRadius: 16,
        marginBottom: 12,
    },
    assistantBubble: {
        alignSelf: 'flex-start',
        borderBottomLeftRadius: 4,
    },
    typingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    typingText: {
        fontSize: 15,
        fontStyle: 'italic',
    },
    typingDots: {
        flexDirection: 'row',
        gap: 4,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
});

export default TypingIndicator;

