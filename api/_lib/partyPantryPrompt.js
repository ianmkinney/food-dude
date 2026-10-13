export function isPartyPantryMealPrompt(text) {
    const t = String(text || '').toLowerCase();
    return /\bpantr(y|ies)\b/.test(t) || /\bfrom our pantry\b/.test(t) || /\bwhat we have\b/.test(t);
}
