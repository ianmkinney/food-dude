import { PARTY_PAYLOAD_FORMAT } from './codec';

/**
 * Build a portable party document from SQLite rows.
 * @param {object} party parties row
 * @param {object[]} members party_members rows
 * @param {object[]} meals party_meals rows (with recipeIds arrays)
 * @param {object} options
 */
export function buildPartyExportDocument(party, members, meals, options = {}) {
    const memberList = members.map((m) => ({
        email: (m.member_email || m.email || '').trim().toLowerCase(),
        name: m.user_name || m.name || '',
    })).filter((m) => m.email);

    const mealList = meals.map((meal) => ({
        id: String(meal.sync_meal_id || meal.id),
        name: meal.name,
        description: meal.description || null,
        recipeIds: meal.recipeIds || [],
        createdBy: meal.created_by || null,
    }));

    return {
        format: PARTY_PAYLOAD_FORMAT,
        uuid: party.party_uuid,
        name: party.name,
        description: party.description || null,
        ownerEmail: (party.owner_email || '').toLowerCase(),
        version: Number(party.sync_version || 1),
        updatedAt: Number(party.updated_at || Date.now()),
        members: memberList,
        meals: mealList,
        scheduledDate: party.scheduled_date || null,
        scheduledMealType: party.scheduled_meal_type || null,
        ...(options.proposal
            ? {
                  proposal: true,
                  proposedBy: options.proposedBy || null,
              }
            : {}),
    };
}

export function summarizePartyChanges(beforeDoc, afterDoc) {
    const lines = [];
    if (!beforeDoc) {
        lines.push(`Import party "${afterDoc.name}" (v${afterDoc.version}).`);
        lines.push(`${afterDoc.meals?.length || 0} meal(s), ${afterDoc.members?.length || 0} member(s).`);
        return lines;
    }
    if (beforeDoc.name !== afterDoc.name) {
        lines.push(`Name: "${beforeDoc.name}" → "${afterDoc.name}"`);
    }
    if ((beforeDoc.description || '') !== (afterDoc.description || '')) {
        lines.push('Description updated.');
    }
    const beforeMeals = new Map((beforeDoc.meals || []).map((m) => [m.id, m]));
    const afterMeals = new Map((afterDoc.meals || []).map((m) => [m.id, m]));
    for (const [id, meal] of afterMeals) {
        if (!beforeMeals.has(id)) {
            lines.push(`Added meal: ${meal.name}`);
        }
    }
    for (const [id, meal] of beforeMeals) {
        if (!afterMeals.has(id)) {
            lines.push(`Removed meal: ${meal.name}`);
        }
    }
    for (const [id, after] of afterMeals) {
        const before = beforeMeals.get(id);
        if (!before) continue;
        if (before.name !== after.name) {
            lines.push(`Renamed meal: ${before.name} → ${after.name}`);
        } else if (JSON.stringify(before.recipeIds) !== JSON.stringify(after.recipeIds)) {
            lines.push(`Recipes updated for meal: ${after.name}`);
        }
    }
    const beforeMembers = new Set((beforeDoc.members || []).map((m) => m.email));
    const afterMembers = new Set((afterDoc.members || []).map((m) => m.email));
    for (const email of afterMembers) {
        if (!beforeMembers.has(email)) lines.push(`Member added: ${email}`);
    }
    for (const email of beforeMembers) {
        if (!afterMembers.has(email)) lines.push(`Member removed: ${email}`);
    }
    if (lines.length === 0) {
        lines.push('No visible differences (version or timestamp may have changed).');
    }
    return lines;
}
