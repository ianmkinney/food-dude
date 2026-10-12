import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { computeCenterCrop } from './coverImageMath';

export { computeCenterCrop } from './coverImageMath';

function toManipulatorSource(uri) {
    if (typeof uri !== 'string') return uri;
    return /^[a-z][a-z0-9+.-]*:/i.test(uri) ? uri : `file://${uri}`;
}

/**
 * EXIF-aware center cover crop + resize → JPEG data URI.
 * @param {string} uri
 * @param {{ width: number, height: number, quality?: number }} target
 * @returns {Promise<string | null>}
 */
export async function encodeCoverJpegDataUri(uri, { width, height, quality = 0.82 }) {
    const targetAspect = width / height;
    let image = await ImageManipulator.manipulate(toManipulatorSource(uri)).renderAsync();
    const crop = computeCenterCrop({ width: image.width, height: image.height }, targetAspect);
    image = await ImageManipulator.manipulate(image)
        .crop({
            originX: Math.round(crop.originX),
            originY: Math.round(crop.originY),
            width: Math.round(crop.width),
            height: Math.round(crop.height),
        })
        .resize({ width, height })
        .renderAsync();
    const saved = await image.saveAsync({
        format: SaveFormat.JPEG,
        compress: quality,
        base64: true,
    });
    if (!saved?.base64) return null;
    return `data:image/jpeg;base64,${saved.base64}`;
}
