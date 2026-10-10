import React from 'react';
import { Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { BrandMark } from './Brand';

type Theme = ReturnType<typeof import('../theme').getTheme>;

const SITE_BASE =
    Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin
        : 'https://amplifood.vercel.app';

const LINKS: { label: string; path: string }[] = [
    { label: 'About', path: '/about' },
    { label: 'Terms of Use', path: '/terms' },
    { label: 'Privacy Policy', path: '/privacy' },
    { label: 'Accessibility', path: '/accessibility' },
    { label: 'Support', path: '/support' },
];

type Props = {
    visible: boolean;
    onClose: () => void;
    theme: Theme;
};

export default function AccountAboutSheet({ visible, onClose, theme }: Props) {
    const version = Constants.expoConfig?.version || '1.0.0';
    const c = theme.colors;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} accessibilityViewIsModal>
            <Pressable style={[styles.backdrop, { backgroundColor: c.overlay }]} onPress={onClose}>
                <Pressable
                    style={[styles.card, { backgroundColor: c.surfaceElevated, borderColor: c.border }]}
                    onPress={(e) => e.stopPropagation()}
                >
                    <View style={styles.header}>
                        <Text
                            style={[styles.title, { color: c.text.primary, fontFamily: theme.typography.fonts.display }]}
                            accessibilityRole="header"
                        >
                            About AmpliFood
                        </Text>
                        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close about">
                            <Ionicons name="close" size={26} color={c.text.secondary} />
                        </Pressable>
                    </View>
                    <BrandMark variant="ink" size={48} style={null} />
                    <Text style={[styles.version, { color: c.text.secondary }]}>Version {version}</Text>
                    <Text style={[styles.tagline, { color: c.text.primary }]}>
                        Your AI sous chef for real-life cooking. Bring your own AI key; your kitchen data stays on this device.
                    </Text>
                    {LINKS.map((link) => (
                        <Pressable
                            key={link.path}
                            style={[styles.linkRow, { borderColor: c.border }]}
                            onPress={() => Linking.openURL(`${SITE_BASE}${link.path}`)}
                            accessibilityRole="link"
                        >
                            <Text style={[styles.linkText, { color: theme.primary[600] }]}>{link.label}</Text>
                            <Ionicons name="open-outline" size={18} color={theme.primary[600]} />
                        </Pressable>
                    ))}
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: 'center',
        padding: 24,
    },
    card: {
        borderRadius: 18,
        borderWidth: 1,
        padding: 20,
        gap: 12,
        maxWidth: 400,
        width: '100%',
        alignSelf: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    title: { fontSize: 22, flex: 1 },
    version: { fontSize: 14, fontWeight: '600' },
    tagline: { fontSize: 15, lineHeight: 22 },
    linkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    linkText: { fontSize: 16, fontWeight: '600' },
});
