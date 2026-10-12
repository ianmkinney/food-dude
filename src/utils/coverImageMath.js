/**
 * Center-crop rectangle (origin + size) for a source image to match target aspect ratio.
 * @param {{ width: number, height: number }} source
 * @param {number} targetAspect width / height
 */
export function computeCenterCrop(source, targetAspect) {
    const sw = Math.max(1, source.width || 1);
    const sh = Math.max(1, source.height || 1);
    const srcAspect = sw / sh;
    if (Math.abs(srcAspect - targetAspect) < 0.001) {
        return { originX: 0, originY: 0, width: sw, height: sh };
    }
    if (srcAspect > targetAspect) {
        const cropW = sh * targetAspect;
        return { originX: (sw - cropW) / 2, originY: 0, width: cropW, height: sh };
    }
    const cropH = sw / targetAspect;
    return { originX: 0, originY: (sh - cropH) / 2, width: sw, height: cropH };
}
