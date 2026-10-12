import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

/**
 * @param {{
 *   theme: object,
 *   label?: string,
 *   disabled?: boolean,
 *   onEstimate: (image: { uri: string, mimeType?: string, file?: Blob }) => Promise<void>,
 * }} props
 */
export default function PantryPhotoEstimateButton({ theme, label = 'Set from photo', disabled, onEstimate }) {
    const [busy, setBusy] = useState(false);

    const runWithUri = async (uri, mimeType, file) => {
        if (!uri) return;
        setBusy(true);
        try {
            await onEstimate({ uri, mimeType: mimeType || 'image/jpeg', file });
        } catch (e) {
            Alert.alert('Photo estimate', e?.message || 'Could not estimate from photo.');
        } finally {
            setBusy(false);
        }
    };

    const pickLibrary = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
        if (!result.canceled && result.assets?.[0]) {
            const a = result.assets[0];
            await runWithUri(a.uri, a.mimeType, a.file);
        }
    };

    const pickCamera = async () => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
            Alert.alert('Camera', Platform.OS === 'web' ? 'Allow camera access for this site.' : 'Camera permission is required.');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
        if (!result.canceled && result.assets?.[0]) {
            const a = result.assets[0];
            await runWithUri(a.uri, a.mimeType, a.file);
        }
    };

    const open = () => {
        Alert.alert('Set from photo', 'Photos stay on your device and are not uploaded to AmpliFood servers except for this AI estimate request.', [
            { text: Platform.OS === 'web' ? 'Take or upload' : 'Take photo', onPress: () => void pickCamera() },
            { text: 'Photo library', onPress: () => void pickLibrary() },
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    return (
        <Pressable
            disabled={disabled || busy}
            onPress={open}
            style={[
                styles.btn,
                {
                    borderColor: theme.primary[500],
                    opacity: disabled || busy ? 0.55 : 1,
                },
            ]}
            accessibilityRole="button"
            accessibilityLabel={label}
        >
            {busy ? (
                <ActivityIndicator color={theme.primary[500]} />
            ) : (
                <Ionicons name="camera-outline" size={20} color={theme.primary[500]} />
            )}
            <Text style={[styles.text, { color: theme.primary[600] }]}>{label}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderRadius: 10,
        marginBottom: 12,
    },
    text: { fontSize: 15, fontWeight: '600' },
});
