import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import {
    FALLBACK_IMAGE_MIME_TYPE,
    describeMimeType,
    isImageMimeSupportedBy,
    isVideoMimeSupportedBy,
    normalizeMimeType,
    resolveImageMimeType,
    resolveVideoMimeType,
} from './mediaTypes';

// Anthropic downsamples anything past ~1568px on the long edge, so shrinking
// first keeps requests small without losing detail the model would have used.
const MAX_LONG_EDGE = 1568;
const JPEG_QUALITY = 0.82;

// PNG stays PNG so screenshot text keeps its crisp edges; everything else lands
// on JPEG, which is the one format every provider and platform agrees on.
function saveFormatFor(mimeType) {
    if (normalizeMimeType(mimeType) === 'image/png') {
        return { format: SaveFormat.PNG, mimeType: 'image/png' };
    }
    return { format: SaveFormat.JPEG, mimeType: FALLBACK_IMAGE_MIME_TYPE };
}

async function readBase64(uri) {
    return FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
}

// Share intents hand back bare filesystem paths; the manipulator wants a scheme.
function toManipulatorSource(uri) {
    if (typeof uri !== 'string') return uri;
    return /^[a-z][a-z0-9+.-]*:/i.test(uri) ? uri : `file://${uri}`;
}

/**
 * Re-encode an image so the bytes provably match the media type we declare.
 * Accepts a file URI or a base64 data URI.
 */
async function reencode(source, targetMimeType) {
    const { format, mimeType } = saveFormatFor(targetMimeType);

    let image = await ImageManipulator.manipulate(toManipulatorSource(source)).renderAsync();
    const longEdge = Math.max(image.width || 0, image.height || 0);
    if (longEdge > MAX_LONG_EDGE) {
        const scale = MAX_LONG_EDGE / longEdge;
        image = await ImageManipulator.manipulate(image)
            .resize({ width: Math.round((image.width || 0) * scale) })
            .renderAsync();
    }

    const result = await image.saveAsync({
        format,
        compress: format === SaveFormat.JPEG ? JPEG_QUALITY : 1,
        base64: true,
    });

    if (!result?.base64) {
        throw new Error('Image re-encoding returned no data');
    }
    return { base64: result.base64, mimeType, uri: result.uri };
}

/**
 * Turn a picked/shared asset into `{ base64, mimeType }` with a media type that
 * matches the actual bytes. HEIC/HEIF and other exotic formats are converted to
 * JPEG because no provider accepts them across the board.
 *
 * @param {string|{uri?: string, path?: string, filePath?: string, mimeType?: string, fileName?: string}} asset
 */
export async function prepareImageForAi(asset) {
    const input = typeof asset === 'string' ? { uri: asset } : asset || {};
    const uri = input.uri || input.path || input.filePath;
    if (!uri) {
        throw new Error('No image was provided.');
    }

    const originalBase64 = await readBase64(uri);
    const detected = resolveImageMimeType({
        base64: originalBase64,
        mimeType: input.mimeType || input.type,
        uri,
        fileName: input.fileName || input.name,
    });

    try {
        return await reencode(uri, detected);
    } catch (error) {
        console.warn('[Media Prep] Falling back to original bytes:', error?.message);
        if (!detected) {
            throw new Error("That image format isn't supported. Try a screenshot or photo (PNG/JPEG).");
        }
        if (!isImageMimeSupportedBy('anthropic', detected) && !isImageMimeSupportedBy('gemini', detected)) {
            throw new Error(
                `${describeMimeType(detected)} images aren't supported. Try a screenshot or photo (PNG/JPEG).`
            );
        }
        return { base64: originalBase64, mimeType: detected, uri };
    }
}

export async function prepareImagesForAi(assets) {
    const list = Array.isArray(assets) ? assets : [assets];
    return Promise.all(list.map((asset) => prepareImageForAi(asset)));
}

/**
 * Last line of defense inside the provider layer: convert instead of declaring a
 * media type the selected provider cannot read.
 */
export async function coerceImagesForProvider(images, provider) {
    if (!images?.length) return images;

    return Promise.all(
        images.map(async (image) => {
            const mimeType = resolveImageMimeType({ base64: image.data, mimeType: image.mimeType });
            if (mimeType && isImageMimeSupportedBy(provider, mimeType)) {
                return { ...image, mimeType };
            }

            try {
                const converted = await reencode(
                    `data:${mimeType || FALLBACK_IMAGE_MIME_TYPE};base64,${image.data}`,
                    FALLBACK_IMAGE_MIME_TYPE
                );
                return { ...image, data: converted.base64, mimeType: converted.mimeType };
            } catch (error) {
                console.warn('[Media Prep] Provider conversion failed:', error?.message);
                throw new Error(
                    `${describeMimeType(mimeType)} images aren't supported by the selected model. Try a screenshot or photo (PNG/JPEG).`
                );
            }
        })
    );
}

export async function prepareVideoForAi(asset) {
    const input = typeof asset === 'string' ? { uri: asset } : asset || {};
    const uri = input.uri || input.path || input.filePath;
    if (!uri) {
        throw new Error('No video was provided.');
    }

    const base64 = await readBase64(uri);
    const mimeType = resolveVideoMimeType({
        base64,
        mimeType: input.mimeType || input.type,
        uri,
        fileName: input.fileName || input.name,
    });

    if (!mimeType) {
        throw new Error("That video format isn't supported. Try an MP4 or MOV.");
    }

    return { base64, mimeType, uri };
}

export function assertVideoSupported(provider, mimeType) {
    if (!isVideoMimeSupportedBy(provider, mimeType)) {
        throw new Error(
            `${describeMimeType(mimeType)} video isn't supported by the selected provider. Video analysis needs Google Gemini — switch provider in Account.`
        );
    }
}
