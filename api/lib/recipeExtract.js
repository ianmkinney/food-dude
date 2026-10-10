/**
 * Parse schema.org Recipe and fallbacks from HTML.
 */

const RECIPE_TYPE = /recipe/i;

function decodeHtmlEntities(text) {
    return String(text || '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)));
}

function stripTags(html) {
    return decodeHtmlEntities(String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

/**
 * @param {string} value ISO-8601 duration or plain minutes
 */
export function parseDurationMinutes(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
    const str = String(value).trim();
    const asNum = Number(str);
    if (Number.isFinite(asNum) && str.match(/^\d+$/)) return Math.round(asNum);
    const match = str.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
    if (!match) return null;
    const days = Number(match[1] || 0);
    const hours = Number(match[2] || 0);
    const minutes = Number(match[3] || 0);
    const seconds = Number(match[4] || 0);
    return Math.max(0, Math.round(days * 24 * 60 + hours * 60 + minutes + seconds / 60)) || null;
}

function normalizeType(type) {
    if (!type) return [];
    return (Array.isArray(type) ? type : [type]).map((t) => String(t).toLowerCase());
}

function isRecipeNode(node) {
    return normalizeType(node?.['@type']).some((t) => RECIPE_TYPE.test(t));
}

/**
 * @param {unknown} data
 * @returns {object[]}
 */
export function collectRecipeNodes(data) {
    const found = [];
    const visit = (node) => {
        if (!node) return;
        if (Array.isArray(node)) {
            node.forEach(visit);
            return;
        }
        if (typeof node !== 'object') return;
        if (isRecipeNode(node)) found.push(node);
        if (node['@graph']) visit(node['@graph']);
    };
    visit(data);
    return found;
}

/**
 * @param {unknown} value
 */
function pickImage(value) {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
        for (const item of value) {
            const picked = pickImage(item);
            if (picked) return picked;
        }
        return null;
    }
    if (typeof value === 'object') {
        return value.url || value.contentUrl || value['@id'] || null;
    }
    return null;
}

/**
 * @param {unknown} instructions
 * @returns {string[]}
 */
export function flattenInstructions(instructions) {
    if (!instructions) return [];
    if (typeof instructions === 'string') {
        const text = stripTags(instructions);
        return text ? [text] : [];
    }
    if (!Array.isArray(instructions)) {
        return flattenInstructions([instructions]);
    }
    const steps = [];
    for (const item of instructions) {
        if (!item) continue;
        if (typeof item === 'string') {
            const text = stripTags(item);
            if (text) steps.push(text);
            continue;
        }
        if (typeof item !== 'object') continue;
        const types = normalizeType(item['@type']);
        if (types.some((t) => t.includes('howtosection'))) {
            const nested = item.itemListElement || item.hasPart || [];
            steps.push(...flattenInstructions(nested));
            continue;
        }
        const text = stripTags(item.text || item.name || item.description);
        if (text) steps.push(text);
    }
    return steps;
}

/**
 * @param {unknown} ingredients
 * @returns {string[]}
 */
export function flattenIngredients(ingredients) {
    if (!ingredients) return [];
    const list = Array.isArray(ingredients) ? ingredients : [ingredients];
    const out = [];
    for (const item of list) {
        if (!item) continue;
        if (typeof item === 'string') {
            const text = stripTags(item);
            if (text) out.push(text);
            continue;
        }
        if (typeof item === 'object') {
            const text = stripTags(item.text || item.name || item.description);
            if (text) out.push(text);
        }
    }
    return out;
}

/**
 * @param {object} node
 */
export function recipeFromJsonLdNode(node, sourceUrl) {
    const title = stripTags(node.name || node.headline);
    const ingredients = flattenIngredients(node.recipeIngredient || node.ingredients);
    const steps = flattenInstructions(node.recipeInstructions || node.step);
    const servingsRaw = node.recipeYield ?? node.yield;
    let servings = null;
    if (typeof servingsRaw === 'number') servings = servingsRaw;
    else if (typeof servingsRaw === 'string') {
        const m = servingsRaw.match(/(\d+)/);
        servings = m ? Number(m[1]) : null;
    } else if (Array.isArray(servingsRaw) && servingsRaw.length) {
        const m = String(servingsRaw[0]).match(/(\d+)/);
        servings = m ? Number(m[1]) : null;
    }

    const times = {
        prepMinutes: parseDurationMinutes(node.prepTime),
        cookMinutes: parseDurationMinutes(node.cookTime),
        totalMinutes: parseDurationMinutes(node.totalTime),
    };
    if (!times.totalMinutes && times.prepMinutes && times.cookMinutes) {
        times.totalMinutes = times.prepMinutes + times.cookMinutes;
    }

    const image = pickImage(node.image);
    if (!title && !ingredients.length && !steps.length) return null;

    return {
        title: title || 'Imported recipe',
        ingredients,
        steps,
        servings,
        times,
        image: image ? String(image) : null,
        sourceUrl,
    };
}

/**
 * @param {string} html
 */
function parseJsonLdRecipes(html, sourceUrl) {
    const recipes = [];
    const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = re.exec(html))) {
        const raw = match[1].trim();
        if (!raw) continue;
        try {
            const json = JSON.parse(raw);
            const nodes = collectRecipeNodes(json);
            for (const node of nodes) {
                const recipe = recipeFromJsonLdNode(node, sourceUrl);
                if (recipe) recipes.push(recipe);
            }
        } catch {
            // ignore invalid JSON-LD blocks
        }
    }
    return recipes;
}

/**
 * @param {string} html
 */
function parseMicrodataRecipe(html, sourceUrl) {
    const scopeMatch = html.match(/itemtype=["']https?:\/\/schema\.org\/Recipe["'][^>]*>([\s\S]{0,120000})/i);
    if (!scopeMatch) return null;
    const chunk = scopeMatch[1];
    const readProp = (prop) => {
        const re = new RegExp(`itemprop=["']${prop}["'][^>]*>([^<]*)<`, 'gi');
        const values = [];
        let m;
        while ((m = re.exec(chunk))) {
            const text = stripTags(m[1]);
            if (text) values.push(text);
        }
        const contentRe = new RegExp(`itemprop=["']${prop}["'][^>]*content=["']([^"']+)`, 'gi');
        while ((m = contentRe.exec(chunk))) {
            const text = stripTags(m[1]);
            if (text) values.push(text);
        }
        return values;
    };

    const title = readProp('name')[0] || null;
    const ingredients = readProp('recipeIngredient');
    const steps = readProp('recipeInstructions');
    const image = readProp('image')[0] || null;
    const servingsMatch = readProp('recipeYield')[0];
    const servings = servingsMatch ? Number((servingsMatch.match(/\d+/) || [])[0]) || null : null;

    const times = {
        prepMinutes: parseDurationMinutes(readProp('prepTime')[0]),
        cookMinutes: parseDurationMinutes(readProp('cookTime')[0]),
        totalMinutes: parseDurationMinutes(readProp('totalTime')[0]),
    };

    if (!title && !ingredients.length && !steps.length) return null;
    return {
        title: title || 'Imported recipe',
        ingredients,
        steps,
        servings,
        times,
        image,
        sourceUrl,
    };
}

/**
 * @param {string} html
 */
function parseOpenGraph(html, sourceUrl) {
    const meta = (property) => {
        const re = new RegExp(
            `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
            'i',
        );
        const alt = new RegExp(
            `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`,
            'i',
        );
        return stripTags(re.exec(html)?.[1] || alt.exec(html)?.[1] || '');
    };
    const title = meta('og:title');
    const image = meta('og:image') || null;
    if (!title) return null;
    return {
        title,
        ingredients: [],
        steps: [],
        servings: null,
        times: { prepMinutes: null, cookMinutes: null, totalMinutes: null },
        image,
        sourceUrl,
    };
}

/**
 * @param {string} html
 */
export function extractReadableText(html) {
    const withoutNoise = String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
    const text = stripTags(withoutNoise);
    return text.slice(0, 50000);
}

/**
 * @param {string} html
 * @param {string} sourceUrl
 */
export function extractRecipeFromHtml(html, sourceUrl) {
    const jsonLd = parseJsonLdRecipes(html, sourceUrl);
    const bestJson = jsonLd.find((r) => r.ingredients.length && r.steps.length) || jsonLd[0];
    if (bestJson && (bestJson.ingredients.length || bestJson.steps.length)) {
        return { mode: 'structured', recipe: bestJson };
    }

    const micro = parseMicrodataRecipe(html, sourceUrl);
    if (micro && (micro.ingredients.length || micro.steps.length)) {
        return { mode: 'structured', recipe: micro };
    }

    const og = parseOpenGraph(html, sourceUrl);
    if (og?.title) {
        const text = extractReadableText(html);
        if (text.length > 400) {
            return { mode: 'text', text, sourceUrl, hintTitle: og.title, image: og.image };
        }
    }

    const text = extractReadableText(html);
    if (text.length > 400) {
        return { mode: 'text', text, sourceUrl };
    }

    return { mode: 'none' };
}
