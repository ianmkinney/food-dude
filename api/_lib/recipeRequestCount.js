/**
 * How many new recipes a cooking command is asking for.
 * Servings, people, and times are not recipe counts.
 * @param {string} message
 * @returns {number | null}
 */
const COUNT_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

const COUNT_TOKEN = '(\\d+|one|two|three|four|five|six|seven|eight|a couple(?: of)?|couple of)';

function parseCountToken(token) {
    const t = String(token || '')
        .toLowerCase()
        .trim()
        .replace(/^a\s+/, '');
    if (t.startsWith('couple')) return 2;
    if (/^\d+$/.test(t)) {
        const n = Number(t);
        return n >= 1 && n <= 8 ? n : null;
    }
    return COUNT_WORDS[t] ?? null;
}

export function requestedNewRecipeCount(message) {
    const m = String(message || '')
        .toLowerCase()
        .replace(/[“”]/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
    if (!m) return null;

    const patterns = [
        new RegExp(
            `\\b${COUNT_TOKEN}\\s+(?:different|separate|more|new|extra|other)\\s+(?:dinner\\s+|lunch\\s+|breakfast\\s+|side\\s+)*(?:recipes?|meals?|dish(?:es)?|ones|ideas)\\b`,
            'i'
        ),
        new RegExp(
            `\\b${COUNT_TOKEN}\\s+(?:different\\s+|separate\\s+|new\\s+|more\\s+)?(?:dinner\\s+|lunch\\s+|breakfast\\s+)?(?:recipes?|meals?|dishes)\\b`,
            'i'
        ),
    ];

    for (const re of patterns) {
        const match = m.match(re);
        if (!match) continue;
        const n = parseCountToken(match[1]);
        if (n) return n;
    }
    return null;
}

export function recipeCountRetryNote(wanted, got) {
    return `The user asked for ${wanted} separate recipes or meals. You returned ${got}. Reply again with exactly ${wanted} create_recipe actions in one actions array. Each action is a different complete dish filled field by field (title, description, servings, prep_time, cook_time, per-serving nutrition, ingredients, instructions). Use pantry items and sensible defaults. Do not ask a clarifying question.`;
}
