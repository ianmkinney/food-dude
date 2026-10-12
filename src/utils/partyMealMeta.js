/**
 * Resolve who added a recipe to a party meal for display (avoid generic "Someone").
 * @param {Record<string, unknown>} meta recipe_meta entry for one recipe id
 * @param {Array<{ sync_member_id?: string, user_id?: string, user_name?: string, member_email?: string, role?: string }>} members
 * @param {{ created_by?: string } | null} meal
 * @param {{ user_id?: string, name?: string } | null} currentUser
 */
export function resolveRecipeContributorName(meta = {}, members = [], meal = null, currentUser = null) {
    const display = meta.addedByDisplayName || meta.addedByName;
    if (typeof display === 'string' && display.trim()) return display.trim();

    const memberId = meta.addedByMemberId || meta.added_by_member_id;
    if (memberId && members.length) {
        const hit = members.find(
            (m) =>
                m.sync_member_id === memberId ||
                String(m.id) === String(memberId) ||
                String(m.member_id) === String(memberId)
        );
        if (hit?.user_name?.trim()) return hit.user_name.trim();
        if (hit?.display_name?.trim()) return hit.display_name.trim();
    }

    const userId = meta.addedByUserId || meta.added_by || meal?.created_by;
    if (userId && members.length) {
        const hit = members.find((m) => String(m.user_id) === String(userId));
        if (hit?.user_name?.trim()) return hit.user_name.trim();
    }

    if (userId && currentUser && String(currentUser.user_id) === String(userId) && currentUser.name?.trim()) {
        return currentUser.name.trim();
    }

    const owner = members.find((m) => m.role === 'owner');
    if (owner?.user_name?.trim() && !memberId) return owner.user_name.trim();

    return null;
}
