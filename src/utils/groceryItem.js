/** Coerce synced or legacy SQLite rows into a safe shape for list UI. */
export function normalizeGroceryRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows
        .filter((row) => row && row.id != null)
        .map((row) => {
            const categoryRaw = row.category;
            const category =
                categoryRaw != null && String(categoryRaw).trim() ? String(categoryRaw).trim() : null;
            const checked = row.is_checked === true || row.is_checked === 1 || row.is_checked === '1';
            return {
                ...row,
                name: row.name != null && String(row.name).trim() ? String(row.name).trim() : 'Item',
                category,
                recipe_name:
                    row.recipe_name != null && String(row.recipe_name).trim()
                        ? String(row.recipe_name).trim()
                        : null,
                is_checked: checked,
            };
        });
}
