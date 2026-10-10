import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme, motion } from '../theme';
import { useTheme } from '../context/ThemeContext';
import AnimatedPressable from './AnimatedPressable';
import { Wordmark } from './Brand';

// public/index.html flies the startup wordmark onto this element by id.
const HeaderTitle = () => <Wordmark height={24} nativeID="af-header-logo" />;

const HeaderIconButton = ({ icon, onPress, label, color }) => (
    <AnimatedPressable
        style={styles.headerButton}
        onPress={onPress}
        accessibilityLabel={label}
        accessibilityRole="button"
        scaleTo={motion.scale.pressHard}
        hitSlop={8}
    >
        <Ionicons name={icon} size={24} color={color} />
    </AnimatedPressable>
);

export const HeaderPartyButton = ({ tintColor }) => {
    const navigation = useNavigation();
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    return (
        <View style={[styles.side, styles.leftSide]}>
            <HeaderIconButton
                icon="people"
                label="Open party"
                onPress={() => navigation.navigate('Party')}
                color={tintColor || theme.colors.text.primary}
            />
        </View>
    );
};

export const HeaderAccountActions = ({ tintColor }) => {
    const navigation = useNavigation();
    const { isDark, toggleTheme } = useTheme();
    const theme = getTheme(isDark);
    const color = tintColor || theme.colors.text.primary;
    return (
        <View style={[styles.side, styles.rightSide]}>
            <HeaderIconButton
                icon={isDark ? 'sunny' : 'moon'}
                label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                onPress={toggleTheme}
                color={color}
            />
            <HeaderIconButton
                icon="person"
                label="Open account"
                onPress={() => navigation.navigate('Account')}
                color={color}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    side: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 0,
    },
    leftSide: {
        marginLeft: 6,
    },
    rightSide: {
        marginRight: 6,
    },
    headerButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export default HeaderTitle;
