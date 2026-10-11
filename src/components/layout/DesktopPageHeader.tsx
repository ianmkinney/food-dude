import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getTheme } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { desktopPageStyles } from './desktopTheme';

type Props = {
    title: string;
    subtitle?: string;
    children?: React.ReactNode;
};

/** In-content page title row for laptop layouts (actions go in `children`). */
export default function DesktopPageHeader({ title, subtitle, children }: Props) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const c = theme.colors;

    return (
        <View style={desktopPageStyles.pageHeader}>
            <View style={desktopPageStyles.pageHeaderRow}>
                <View style={desktopPageStyles.pageHeaderText}>
                    <Text
                        style={[desktopPageStyles.pageTitle, { color: c.text.primary, fontFamily: theme.typography.fonts.display }]}
                        accessibilityRole="header"
                    >
                        {title}
                    </Text>
                    {subtitle ? (
                        <Text style={[desktopPageStyles.pageSubtitle, { color: c.text.secondary }]}>{subtitle}</Text>
                    ) : null}
                </View>
                {children ? <View style={desktopPageStyles.pageHeaderActions}>{children}</View> : null}
            </View>
        </View>
    );
}
