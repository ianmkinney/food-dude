import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';
import { encodeCoverJpegDataUri } from './coverImageEncode';

const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 630;
/** Square thumb for party header + list chips (displayed in square frames). */
const THUMB_SIZE = 384;
/** Matches server MAX_PARTY_IMAGE_BYTES (~500KB JPEG after compression). */
export const MAX_PARTY_COVER_BYTES = 500 * 1024;

function base64DecodedByteLength(base64) {
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    return Math.floor((base64.length * 3) / 4) - padding;
}

async function pickImageUri() {
    const library = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!library.granted) {
        throw new Error('Photo library permission is required.');
    }
    const camera = await ImagePicker.requestCameraPermissionsAsync();
    return new Promise((resolve) => {
        const chooseLibrary = async () => {
            const picked = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: false,
                quality: 1,
                exif: true,
            });
            if (picked.canceled || !picked.assets?.[0]?.uri) resolve(null);
            else resolve(picked.assets[0].uri);
        };
        const chooseCamera = async () => {
            if (!camera.granted) {
                Alert.alert('Camera', 'Allow camera access in Settings to take a photo.');
                resolve(null);
                return;
            }
            const picked = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: false,
                quality: 1,
                exif: true,
            });
            if (picked.canceled || !picked.assets?.[0]?.uri) resolve(null);
            else resolve(picked.assets[0].uri);
        };
        if (Platform.OS === 'web') {
            void chooseLibrary();
            return;
        }
        Alert.alert('Party photo', 'Choose a source', [
            { text: 'Photo library', onPress: () => void chooseLibrary() },
            { text: 'Camera', onPress: () => void chooseCamera() },
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        ]);
    });
}

/** @returns {Promise<{ full: string, thumb: string } | null>} */
export async function pickPartyCoverImages() {
    const uri = await pickImageUri();
    if (!uri) return null;

    let quality = 0.82;
    let full = null;
    for (let attempt = 0; attempt < 7; attempt++) {
        full = await encodeCoverJpegDataUri(uri, {
            width: TARGET_WIDTH,
            height: TARGET_HEIGHT,
            quality,
        });
        if (!full) return null;
        const raw = full.split(',')[1] || '';
        if (base64DecodedByteLength(raw) <= MAX_PARTY_COVER_BYTES) break;
        quality -= 0.1;
        if (quality < 0.35) {
            throw new Error('Photo is too large after compression (max ~500KB). Try a simpler image.');
        }
    }
    const thumb = await encodeCoverJpegDataUri(uri, {
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        quality: 0.78,
    });
    return full && thumb ? { full, thumb } : null;
}

export async function pickPartyCoverImageBase64() {
    const picked = await pickPartyCoverImages();
    return picked?.full ?? null;
}
