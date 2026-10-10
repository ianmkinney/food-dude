import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 630;

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
    const manipulated = await ImageManipulator.manipulateAsync(
        picked.assets[0].uri,
        [{ resize: { width: TARGET_WIDTH, height: TARGET_HEIGHT } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    if (!manipulated.base64) return null;
    return `data:image/jpeg;base64,${manipulated.base64}`;
}
