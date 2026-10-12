import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 630;
const THUMB_WIDTH = 320;
const THUMB_HEIGHT = 168;
/** Matches server MAX_PARTY_IMAGE_BYTES (~500KB JPEG after compression). */
export const MAX_PARTY_COVER_BYTES = 500 * 1024;

function base64DecodedByteLength(base64) {
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    return Math.floor((base64.length * 3) / 4) - padding;
}

async function manipulateCover(uri, width, height, quality) {
    const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width, height } }],
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    if (!manipulated.base64) return null;
    return `data:image/jpeg;base64,${manipulated.base64}`;
}

/** @returns {Promise<{ full: string, thumb: string } | null>} */
export async function pickPartyCoverImages() {
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
    let full = null;
    for (let attempt = 0; attempt < 7; attempt++) {
        full = await manipulateCover(uri, TARGET_WIDTH, TARGET_HEIGHT, quality);
        if (!full) return null;
        const raw = full.split(',')[1] || '';
        if (base64DecodedByteLength(raw) <= MAX_PARTY_COVER_BYTES) break;
        quality -= 0.1;
        if (quality < 0.35) {
            throw new Error('Photo is too large after compression (max ~500KB). Try a simpler image.');
        }
    }
    const thumb = await manipulateCover(uri, THUMB_WIDTH, THUMB_HEIGHT, 0.72);
    return full && thumb ? { full, thumb } : null;
}

export async function pickPartyCoverImageBase64() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
        throw new Error('Photo library permission is required.');
    }
    const picked = await pickPartyCoverImages();
    return picked?.full ?? null;
}
