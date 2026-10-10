import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 630;
/** Matches server MAX_PARTY_IMAGE_BYTES (~500KB JPEG after compression). */
export const MAX_PARTY_COVER_BYTES = 500 * 1024;

function base64DecodedByteLength(base64) {
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    return Math.floor((base64.length * 3) / 4) - padding;
}

export async function pickPartyCoverImageBase64() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
        throw new Error('Photo library permission is required.');
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [40, 21],
        quality: 0.85,
    });
    if (picked.canceled || !picked.assets?.[0]?.uri) return null;
    const uri = picked.assets[0].uri;
    let quality = 0.82;
    for (let attempt = 0; attempt < 7; attempt++) {
        const manipulated = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: TARGET_WIDTH, height: TARGET_HEIGHT } }],
            { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        if (!manipulated.base64) return null;
        if (base64DecodedByteLength(manipulated.base64) <= MAX_PARTY_COVER_BYTES) {
            return `data:image/jpeg;base64,${manipulated.base64}`;
        }
        quality -= 0.1;
        if (quality < 0.35) {
            throw new Error('Photo is too large after compression (max ~500KB). Try a simpler image.');
        }
    }
    return null;
}
