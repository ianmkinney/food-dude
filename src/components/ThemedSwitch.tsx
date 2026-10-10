import React from 'react';
import { Switch, SwitchProps } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { getTheme } from '../theme';

/** Switch whose off track keeps at least 3:1 contrast against every surface. */
export default function ThemedSwitch(props: SwitchProps) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    return (
        <Switch
            trackColor={{ false: theme.colors.borderStrong, true: theme.primary[500] }}
            thumbColor="#FFFFFF"
            ios_backgroundColor={theme.colors.borderStrong}
            {...({ activeThumbColor: '#FFFFFF' } as object)}
            {...props}
        />
    );
}
