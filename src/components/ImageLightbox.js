import React from 'react';
import { Modal, Pressable, StyleSheet, View, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ImageLightbox({ visible, uri, onClose, isDark }) {
    const insets = useSafeAreaInsets();
    if (!uri) return null;
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={[styles.backdrop, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
                <Pressable style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close image">
                    <Ionicons name="close" size={28} color="#FFFFFF" />
                </Pressable>
                <Pressable style={styles.stage} onPress={onClose} accessibilityRole="imagebutton" accessibilityLabel="Enlarged image">
                    <Image source={{ uri }} style={styles.image} resizeMode="contain" accessibilityIgnoresInvertColors />
                </Pressable>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.92)',
        justifyContent: 'center',
    },
    close: {
        position: 'absolute',
        top: Platform.OS === 'web' ? 16 : 48,
        right: 16,
        zIndex: 2,
        padding: 8,
    },
    stage: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
    image: { width: '100%', height: '100%', maxWidth: 1200, maxHeight: '90%' },
});
