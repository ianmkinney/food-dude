import type { PlatformImage } from '../monetization/platformAi';

/** Native builds don't bundle pdf.js yet; ask the user to photograph pages or use the web app. */
export async function preparePdfFromBytes(_bytes: Uint8Array, name: string): Promise<{ text: string; pageImages: PlatformImage[] }> {
    return {
        text: `[PDF "${name}" attached. Text extraction from PDFs works in the web app; on this device, photograph the recipe or export as an image.]`,
        pageImages: [],
    };
}
