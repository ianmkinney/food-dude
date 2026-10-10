import { put } from '@vercel/blob';

export function isBlobConfigured() {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

/**
 * @param {{ partyId: string, buffer: Buffer, contentType: string }} params
 */
export async function uploadPartyImage({ partyId, buffer, contentType }) {
    if (!isBlobConfigured()) {
        return { url: null, storedAsBytea: true };
    }
    const ext =
        contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const pathname = `party-images/${partyId}-${Date.now()}.${ext}`;
    const blob = await put(pathname, buffer, {
        access: 'public',
        contentType: contentType || 'image/jpeg',
        token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return { url: blob.url, storedAsBytea: false };
}
