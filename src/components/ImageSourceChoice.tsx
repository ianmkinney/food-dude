import React from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { toPersistentImageUri } from '../services/mediaPrep';

// Every recipe/image slot offers a real photo as readily as an AI one. A photo
// from the user is never labelled AI; a generated one always is.

type Props = {
    onPhoto: (uri: string) => void;
    onGenerate?: () => void;
    generating?: boolean;
    generatingLabel?: string;
};

async function fromCamera(): Promise<string | null> {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
        Alert.alert('Camera is off', 'Allow the camera in Settings to take a photo, or choose one from your library.');
        return null;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.8 });
    return result.canceled ? null : result.assets[0].uri;
}

async function fromLibrary(): Promise<string | null> {
    // The system photo picker shares only the photo the user picks; no library permission.
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.8 });
    return result.canceled ? null : result.assets[0].uri;
}

export default function ImageSourceChoice({ onPhoto, onGenerate, generating = false, generatingLabel }: Props) {
    const pick = async (source: 'camera' | 'library') => {
        try {
            const uri = source === 'camera' ? await fromCamera() : await fromLibrary();
            if (uri) onPhoto(await toPersistentImageUri(uri));
        } catch (error) {
            Alert.alert('Photo', (error as Error)?.message || "Couldn't get that photo.");
        }
    };

    const useMyPhoto = () => {
        Alert.alert('Use my photo', undefined, [
            { text: Platform.OS === 'web' ? 'Take or upload a photo' : 'Take a photo', onPress: () => pick('camera') },
            { text: 'Choose from library', onPress: () => pick('library') },
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    return (
        <View style={styles.row}>
            <Pressable onPress={useMyPhoto} style={[styles.button, styles.photo]} accessibilityRole="button">
                <Ionicons name="camera" size={18} color="#2A1424" />
                <Text style={[styles.text, { color: '#2A1424' }]}>Use my photo</Text>
            </Pressable>
            {onGenerate && (
                <Pressable onPress={onGenerate} disabled={generating} style={[styles.button, styles.generate]} accessibilityRole="button">
                    {generating ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="sparkles" size={18} color="#FFFFFF" />}
                    <Text style={[styles.text, { color: '#FFFFFF' }]}>{generating ? generatingLabel || 'Generating…' : 'Generate'}</Text>
                </Pressable>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
    button: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
    photo: { backgroundColor: '#FFF8EC' },
    generate: { backgroundColor: '#A9420D' },
    text: { fontSize: 15, fontWeight: '800' },
});
