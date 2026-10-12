/** Pure eligibility rules for auto recipe covers (no RN / DB imports). */

export type RecipeCardLike = {
    type: string;
    fromUserFile?: boolean;
    recipe: { image_uri?: string | null };
    autoImage?: { status: 'loading' | 'failed'; errorMessage?: string };
};

export function recipeCardNeedsAutoImage(card: RecipeCardLike): boolean {
    if (card.type !== 'recipe') return false;
    if (card.fromUserFile) return false;
    if (card.recipe?.image_uri) return false;
    return true;
}

export function withAutoImageLoading<T extends RecipeCardLike>(cards: T[] | undefined): T[] | undefined {
    if (!cards?.length) return cards;
    return cards.map((card) =>
        recipeCardNeedsAutoImage(card) ? { ...card, autoImage: { status: 'loading' } } : card
    );
}
