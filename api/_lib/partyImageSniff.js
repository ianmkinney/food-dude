/**
 * Detect image type from magic bytes (JPEG, PNG, WebP only).
 * @param {Buffer} buffer
 * @returns {{ contentType: string, ext: string } | null}
 */
export function sniffImageBuffer(buffer) {
    if (!buffer || buffer.length < 12) return null;
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return { contentType: 'image/jpeg', ext: 'jpg' };
    }
    if (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
    ) {
        return { contentType: 'image/png', ext: 'png' };
    }
    if (
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46 &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
    ) {
        return { contentType: 'image/webp', ext: 'webp' };
    }
    return null;
}

export function decodePartyImageBase64(imageBase64) {
    const raw = String(imageBase64 || '').replace(/^data:image\/\w+;base64,/, '');
    try {
        return Buffer.from(raw, 'base64');
    } catch {
        return null;
    }
}
