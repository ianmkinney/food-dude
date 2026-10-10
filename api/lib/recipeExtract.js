/**
 * Extract recipe fields from HTML (JSON-LD, microdata, Open Graph).
 */

const RECIPE_TYPES = new Set(['Recipe', 'https://schema.org/Recipe', 'http://schema.org/Recipe']);

function parseIsoDurationMinutes(value) {
    if (!value || typeof value !== 'string') return null;
    const match = value.trim().match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
    if (!match) {
        const asNum = Number(value);
        return Number.isFinite(asNum) && asNum > 0 ? Math.round(asNum) : null;
    }
    const days = Number(match[1] || 0);
    const hours = Number(match[2] || 0);
    const minutes = Number(match[3] || 0);
    const seconds = Number(match[4] || 0);
    const total = days * 24 * 60 + hours * 60 + minutes + Math.round(seconds / 60);
    return total > 0 ? total : null;
}

function flattenJsonLd(node, out = []) {
    if (!node) return out;
    if (Array.isArray(node)) {
        for (const item of node) flattenJsonLd(item, out);
        return out;
    }
    if (typeof node !== 'object') return out;
    if (node['@graph']) flattenJsonLd(node['@graph'], out);
    out.push(node);
    return out;
}

function recipeTypeMatches(typeField) {
    if (!typeField) return false;
    const types = Array.isArray(typeField) ? typeField : [typeField];
    return types.some((t) => RECIPE_TYPES.has(String(t)));
}

function textFromInstruction(step) {
    if (!step) return null;
    if (typeof step === 'string') return step.trim() || null;
    if (typeof step !== 'object') return null;
    if (typeof step.text === 'string') return step.text.trim() || null;
    if (typeof step.name === 'string') return step.name.trim() || null;
    if (step['@type'] === 'HowToSection' || (Array.isArray(step['@type']) && step['@type'].includes('HowToSection'))) {
        const sectionName = step.name ? `${String(step.name).trim()}: ` : '';
        const items = step.itemListElement || step.hasPart;
        const parts = [];
        const list = Array.isArray(items) ? items : items ? [items] : [];
        for (const item of list) {
            const line = textFromInstruction(item);
            if (line) parts.push(line);
        }
        if (!parts.length) return null;
        return sectionName + parts.join(' ');
    }
    if (step.itemListElement) {
        const nested = Array.isArray(step.itemListElement) ? step.itemListElement : [step.itemListElement];
        return nested.map((n) => textFromInstruction(n)).filter(Boolean).join(' ') || null;
    }
    return null;
}

function ingredientLine(ing) {
    if (!ing) return null;
    if (typeof ing === 'string') return ing.trim() || null;
    if (typeof ing !== 'object') return null;
    if (typeof ing.name === 'string') {
        const amount = ing.amount;
        if (typeof amount === 'string' && amount.trim()) {
            return `${amount.trim()} ${ing.name.trim()}`.trim();
        }
        return ing.name.trim();
    }
    return null;
}

function pickRecipeNode(nodes) {
    for (const node of nodes) {
        if (recipeTypeMatches(node['@type'])) return node;
    }
    return null;
}

function extractJsonLdRecipe(html) {
    const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const match of scripts) {
        const raw = match[1]?.trim();
        if (!raw) continue;
        try {
            const json = JSON.parse(raw);
            const flat = flattenJsonLd(json);
            const recipe = pickRecipeNode(flat);
            if (!recipe) continue;
            const title = recipe.name || recipe.headline || null;
            const ingredients = [];
            const ingField = recipe.recipeIngredient || recipe.ingredients;
            const ingList = Array.isArray(ingField) ? ingField : ingField ? [ingField] : [];
            for (const ing of ingList) {
                const line = ingredientLine(ing);
                if (line) ingredients.push(line);
            }
            const steps = [];
            const instr = recipe.recipeInstructions;
            const instrList = Array.isArray(instr) ? instr : instr ? [instr] : [];
            for (const step of instrList) {
                const line = textFromInstruction(step);
                if (line) steps.push(line);
            }
            let servings = null;
            if (recipe.recipeYield != null) {
                const yieldVal = Array.isArray(recipe.recipeYield) ? recipe.recipeYield[0] : recipe.recipeYield;
                const num = Number(String(yieldVal).replace(/[^\d.]/g, ''));
                servings = Number.isFinite(num) && num > 0 ? Math.round(num) : null;
            }
            const times = {
                prepMinutes: parseIsoDurationMinutes(recipe.prepTime),
                cookMinutes: parseIsoDurationMinutes(recipe.cookTime),
                totalMinutes: parseIsoDurationMinutes(recipe.totalTime),
            };
            let image = null;
            if (recipe.image) {
                const img = Array.isArray(recipe.image) ? recipe.image[0] : recipe.image;
                if (typeof img === 'string') image = img;
                else if (img && typeof img === 'object' && typeof img.url === 'string') image = img.url;
            }
            if (title && (ingredients.length || steps.length)) {
                return { title: String(title).trim(), ingredients, steps, servings, times, image };
            }
        } catch {
            // try next script block
        }
    }
    return null;
}

export function metaContent(html, property) {
    const re = new RegExp(
        `<meta[^>]+(?:property|name)=["']${property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]+content=["']([^"']+)["']`,
        'i',
    );
    const alt = new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`,
        'i',
    );
    const m = html.match(re) || html.match(alt);
    return m ? decodeHtmlEntities(m[1].trim()) : null;
}

function decodeHtmlEntities(text) {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function stripTags(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractMicrodataRecipe(html) {
    const itemtypeMatch = html.match(/itemtype=["']https?:\/\/schema\.org\/Recipe["']/i);
    if (!itemtypeMatch) return null;
    const title =
        metaContent(html, 'og:title') ||
        html.match(/itemprop=["']name["'][^>]*>([^<]+)/i)?.[1]?.trim() ||
        null;
    const ingredients = [];
    for (const m of html.matchAll(/itemprop=["']recipeIngredient["'][^>]*>([^<]+)/gi)) {
        const line = m[1]?.trim();
        if (line) ingredients.push(decodeHtmlEntities(line));
    }
    const steps = [];
    for (const m of html.matchAll(/itemprop=["'](?:recipeInstructions|text)["'][^>]*>([^<]+)/gi)) {
        const line = m[1]?.trim();
        if (line) steps.push(decodeHtmlEntities(line));
    }
    const image = metaContent(html, 'og:image');
    if (title && (ingredients.length || steps.length)) {
        return {
            title,
            ingredients,
            steps,
            servings: null,
            times: { prepMinutes: null, cookMinutes: null, totalMinutes: null },
            image,
        };
    }
    return null;
}

export function htmlToReadableText(html, maxLen = 12000) {
    const stripped = stripTags(html);
    if (!stripped) return '';
    return stripped.length > maxLen ? `${stripped.slice(0, maxLen)}…` : stripped;
}

/**
 * @returns {{ structured: object | null, text: string }}
 */
export function extractRecipeFromHtml(html) {
    const structured = extractJsonLdRecipe(html) || extractMicrodataRecipe(html);
    if (structured) {
        if (!structured.image) {
            structured.image = metaContent(html, 'og:image');
        }
        return { structured, text: htmlToReadableText(html) };
    }
    const ogTitle = metaContent(html, 'og:title');
    const text = htmlToReadableText(html);
    if (ogTitle && text) {
        return {
            structured: null,
            text,
            hintTitle: ogTitle,
        };
    }
    return { structured: null, text };
}

export function hasRecipeShape(structured) {
    return Boolean(
        structured &&
            structured.title &&
            (structured.ingredients?.length || structured.steps?.length),
    );
}
