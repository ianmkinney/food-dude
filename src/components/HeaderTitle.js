import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';

const FOOD_EMOJIS = ['🍕', '🍔', '🌮', '🥗', '🍣', '🍩', '🍪', '🥑', '🥓', '🥞'];

const HeaderTitle = ({ tintColor, showPartyButton = true, showAccountButton = false }) => {
    const [emojiIndex, setEmojiIndex] = useState(0);
    const [fadeAnim] = useState(new Animated.Value(1));
    const navigation = useNavigation();
    const { isDark, toggleTheme } = useTheme();
    const theme = getTheme(isDark);

    useEffect(() => {
        const interval = setInterval(() => {
            // Fade out
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }).start(() => {
                // Change emoji
                setEmojiIndex((prevIndex) => (prevIndex + 1) % FOOD_EMOJIS.length);

                // Fade in
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }).start();
            });
        }, 2000); // Change every 2 seconds

        return () => clearInterval(interval);
    }, []);

    return (
        <View style={styles.container}>
            {showPartyButton && (
                <TouchableOpacity
                    style={[styles.headerButton, styles.leftButton]}
                    onPress={() => navigation.navigate('Party')}
                >
                    <Ionicons name="people" size={24} color={tintColor || theme.colors.text.primary} />
                </TouchableOpacity>
            )}
            <View style={styles.titleContainer}>
                <Animated.Text style={[styles.emoji, { opacity: fadeAnim }]}>
                    {FOOD_EMOJIS[emojiIndex]}
                </Animated.Text>
                <Text style={[styles.title, { color: tintColor }]}> Food Dude </Text>
                <Text style={styles.emoji}>😎</Text>
            </View>
            {showAccountButton && (
                <>
                    <TouchableOpacity
                        style={[styles.headerButton, styles.rightButton, { right: -60 }]}
                        onPress={toggleTheme}
                    >
                        <Ionicons 
                            name={isDark ? 'sunny' : 'moon'} 
                            size={24} 
                            color={tintColor || theme.colors.text.primary} 
                        />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.headerButton, styles.rightButton]}
                        onPress={() => navigation.navigate('Account')}
                    >
                        <Ionicons name="person" size={24} color={tintColor || theme.colors.text.primary} />
                    </TouchableOpacity>
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
