import React, { useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { getTheme } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { desktopAccountStyles } from './desktopTheme';

const SECTIONS = [
    { id: 'profile', label: 'Profile' },
    { id: 'safety', label: 'Safety' },
    { id: 'signin', label: 'Sign-in & backup' },
    { id: 'ai', label: 'AI & voice' },
    { id: 'privacy', label: 'Privacy' },
    { id: 'settings', label: 'Settings' },
];

type Props = {
    children: React.ReactNode;
    sectionOffsets: Record<string, number>;
};

export default function AccountDesktopShell({ children, sectionOffsets }: Props) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const c = theme.colors;
    const scrollRef = useRef<ScrollView>(null);
    const [active, setActive] = React.useState('profile');

    const jump = (id: string) => {
        setActive(id);
        const y = sectionOffsets[id];
        if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    };

    return (
        <View style={desktopAccountStyles.shell}>
            <View
                style={[desktopAccountStyles.subNav, { borderRightColor: c.borderSoft, backgroundColor: c.surfaceMuted }]}
                accessibilityRole="menu"
                accessibilityLabel="Account sections"
            >
                {SECTIONS.map((s) => (
                    <Pressable
                        key={s.id}
                        onPress={() => jump(s.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active === s.id }}
                        style={({ pressed }) => [
                            desktopAccountStyles.subNavItem,
                            active === s.id && { backgroundColor: isDark ? 'rgba(235,106,28,0.14)' : theme.primary[50] },
                            active !== s.id && pressed && { backgroundColor: c.surfaceElevated },
                        ]}
                    >
                        <Text style={{ color: active === s.id ? theme.primary[600] : c.text.secondary, fontWeight: '600' }}>
                            {s.label}
                        </Text>
                    </Pressable>
                ))}
            </View>
            <ScrollView
                ref={scrollRef}
                style={desktopAccountStyles.main}
                contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
                keyboardShouldPersistTaps="handled"
            >
                {children}
            </ScrollView>
        </View>
    );
}
