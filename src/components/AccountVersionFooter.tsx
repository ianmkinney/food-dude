import React, { useState } from 'react';
import { LayoutAnimation, Platform, ScrollView, StyleSheet, Text, UIManager, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AnimatedPressable from './AnimatedPressable';
import { BrandMark } from './Brand';
import { getBundledReleases, getVersionLine } from '../config/appRelease';

type Theme = ReturnType<typeof import('../theme').getTheme>;

type Props = {
    theme: Theme;
};

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function AccountVersionFooter({ theme }: Props) {
    const [expanded, setExpanded] = useState(false);
    const c = theme.colors;
    const releases = getBundledReleases();

    const toggle = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded((v) => !v);
    };

    return (
        <View style={styles.stamp}>
            <BrandMark variant="ink" size={56} style={null} />
            <Text style={[styles.versionLine, { color: c.text.secondary }]} accessibilityRole="text">
                {getVersionLine()}
            </Text>
            <AnimatedPressable
                onPress={toggle}
                style={styles.notesToggle}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel="Release notes"
            >
                <Text style={[styles.notesToggleText, { color: theme.primary[600] }]}>Release notes</Text>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.primary[600]} />
            </AnimatedPressable>
            {expanded ? (
                <View style={[styles.notesPanel, { borderColor: c.border, backgroundColor: c.surfaceMuted }]}>
                    <ScrollView
                        style={styles.notesScroll}
                        nestedScrollEnabled
                        showsVerticalScrollIndicator
                        accessibilityLabel="Release notes content"
                    >
                        {releases.map((release) => (
                            <View key={release.version} style={styles.releaseBlock}>
                                <Text style={[styles.releaseTitle, { color: c.text.primary }]}>
                                    {release.version}
                                    {release.date ? ` · ${release.date}` : ''}
                                </Text>
                                <Text style={[styles.releaseBody, { color: c.text.secondary }]}>{release.body}</Text>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            ) : null}
            <Text style={[styles.tagline, { color: c.text.tertiary }]}>cooking, turned up</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    stamp: {
        alignItems: 'center',
        paddingTop: 8,
        paddingBottom: 40,
        paddingHorizontal: 20,
        opacity: 0.92,
        width: '100%',
        maxWidth: 640,
        alignSelf: 'center',
    },
    versionLine: {
        marginTop: 10,
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.2,
        textAlign: 'center',
    },
    notesToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 12,
        paddingVertical: 6,
        paddingHorizontal: 8,
    },
    notesToggleText: {
        fontSize: 14,
        fontWeight: '600',
    },
    notesPanel: {
        marginTop: 8,
        width: '100%',
        maxHeight: 280,
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
    },
    notesScroll: {
        padding: 14,
    },
    releaseBlock: {
        marginBottom: 16,
    },
    releaseTitle: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 6,
    },
    releaseBody: {
        fontSize: 13,
        lineHeight: 19,
    },
    tagline: {
        marginTop: 14,
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.4,
    },
});
