import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme, motion } from '../theme';
import { useTheme } from '../context/ThemeContext';
import AnimatedPressable from './AnimatedPressable';
import { Wordmark } from './Brand';

const HeaderTitle = () => <Wordmark />;

export const HeaderIconButton = ({ icon, onPress, label, color, role = 'button', checked }) => (
    <AnimatedPressable
        style={styles.headerButton}
        onPress={onPress}
        accessibilityLabel={label}
        accessibilityRole={role}
        accessibilityState={checked === undefined ? undefined : { checked }}
        scaleTo={motion.scale.pressHard}
    >
        <Ionicons name={icon} size={22} color={color} />
    </AnimatedPressable>
);

/** @param {{ tintColor?: string }} props */
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

/** @param {{ tintColor?: string, leading?: any }} props */
export const HeaderAccountActions = ({ tintColor, leading }) => {
    const navigation = useNavigation();
    const { isDark, toggleTheme } = useTheme();
    const theme = getTheme(isDark);
    const color = tintColor || theme.colors.text.primary;
    return (
        <View style={[styles.side, styles.rightSide]}>
            {leading}
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
    },
    leftSide: {
        marginLeft: 4,
    },
    rightSide: {
        marginRight: 4,
    },
    headerButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
    },
});

export default HeaderTitle;
