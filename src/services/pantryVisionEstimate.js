import { stripCodeFences } from './aiClient';
import { generateMultimodal } from './aiClient';
import { prepareImageForAi } from './mediaPrep';
import { clampPantryPct } from '../utils/pantryLevels';

function parseJsonObject(text) {
    const cleaned = stripCodeFences(String(text || '').trim());
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
        return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
        return null;
    }
}

const SINGLE_PROMPT = (itemName) =>
    `You are estimating pantry stock from a photo. Item: "${itemName}".
Return ONLY JSON: {"freshness_pct":0-100,"amount_pct":0-100}
freshness_pct: 100=perfectly fresh, 0=spoiled. amount_pct: 100=full container, 0=almost empty.
Base estimates only on visible evidence.`;

const BULK_PROMPT = (names) =>
    `You are estimating pantry items from a photo of a pantry/fridge shelf.
Known pantry item names (match loosely): ${names.join(', ')}.
Return ONLY JSON: {"items":[{"name":string,"freshness_pct":0-100,"amount_pct":0-100},...]}
Include only items you can see that match the list (or obvious variants). Omit items not visible.`;

/**
 * @param {{ uri: string, mimeType?: string, file?: Blob }} image
 * @param {string} itemName
 */
export async function estimatePantryItemFromPhoto(image, itemName) {
    const prepared = await prepareImageForAi({ uri: image.uri, mimeType: image.mimeType, file: image.file });
    const raw = await generateMultimodal({
        feature: 'imageImport',
        prompt: SINGLE_PROMPT(itemName),
        images: [{ data: prepared.base64, mimeType: prepared.mimeType }],
    });
    const json = parseJsonObject(raw);
    if (!json) throw new Error('Could not read an estimate from the photo. Try another angle or adjust manually.');
    return {
        freshness_pct: clampPantryPct(json.freshness_pct),
        amount_pct: clampPantryPct(json.amount_pct),
        aiEstimate: true,
    };
}

/**
 * @param {{ uri: string, mimeType?: string, file?: Blob }} image
 * @param {{ id: number, name: string }[]} pantryItems
 */
export async function estimatePantryBulkFromPhoto(image, pantryItems) {
    const names = pantryItems.map((p) => p.name).filter(Boolean);
    if (!names.length) throw new Error('Add pantry items before using bulk photo estimate.');
    const prepared = await prepareImageForAi({ uri: image.uri, mimeType: image.mimeType, file: image.file });
    const raw = await generateMultimodal({
        feature: 'imageImport',
        prompt: BULK_PROMPT(names),
        images: [{ data: prepared.base64, mimeType: prepared.mimeType }],
    });
    const json = parseJsonObject(raw);
    const rows = Array.isArray(json?.items) ? json.items : [];
    const out = [];
    for (const row of rows) {
        const name = String(row?.name || '').trim();
        if (!name) continue;
        const match =
            pantryItems.find((p) => p.name.toLowerCase() === name.toLowerCase()) ||
            pantryItems.find((p) => name.toLowerCase().includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(name.toLowerCase()));
        if (!match) continue;
        out.push({
            id: match.id,
            name: match.name,
            freshness_pct: clampPantryPct(row.freshness_pct),
            amount_pct: clampPantryPct(row.amount_pct),
            aiEstimate: true,
        });
    }
    if (!out.length) {
        throw new Error('No pantry items matched this photo. Try a clearer shot or update one item at a time.');
    }
    return out;
}
