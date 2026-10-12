import { recipeOperations } from '../database/operations';
import { generateImage } from '../services/aiClient';
import { isAiConfigured } from '../services/aiSettings';
import { buildRecipeImagePrompt } from '../services/recipeImagePrompt';
import { toPersistentImageUri } from '../services/mediaPrep';
import { isAutoRecipeImageEnabled } from '../settings/autoRecipeImageSettings';
import type { SousCard } from './tools';
import { recipeCardNeedsAutoImage } from './autoRecipeImagePolicy';

export const AUTO_RECIPE_IMAGE_TIMEOUT_MS = 45_000;

export type RecipeCard = Extract<SousCard, { type: 'recipe' }>;

export { recipeCardNeedsAutoImage, withAutoImageLoading } from './autoRecipeImagePolicy';

export type AmpiMessageSlice = { id: string; cards?: SousCard[] };

export type MessageCardsUpdater<M extends AmpiMessageSlice = AmpiMessageSlice> = (
    fn: (prev: M[]) => M[]
) => void;

function patchRecipeCard<M extends AmpiMessageSlice>(
    updateMessages: MessageCardsUpdater<M>,
    messageId: string,
    recipeId: number,
    patch: Partial<RecipeCard>
) {
    updateMessages((prev) =>
        prev.map((m) => {
            if (m.id !== messageId || !m.cards) return m;
            return {
                ...m,
                cards: m.cards.map((c) =>
                    c.type === 'recipe' && c.recipe.id === recipeId ? { ...c, ...patch } : c
                ),
            };
        })
    );
}

async function generateAndPersistRecipeImage(recipeId: number): Promise<string> {
    const recipe = await recipeOperations.getById(recipeId);
    if (!recipe) throw new Error('Recipe not found');
    if (recipe.image_uri && recipe.image_source === 'user') {
        throw new Error('Recipe already has a user photo');
    }
    if (recipe.image_uri && recipe.image_source && recipe.image_source !== 'ai') {
        throw new Error('Recipe already has a cover image');
    }

    const prompt = buildRecipeImagePrompt(recipe);
    const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Image generation timed out. Try again.')), AUTO_RECIPE_IMAGE_TIMEOUT_MS);
    });
    const result = await Promise.race([generateImage(prompt), timeout]);
    const stored = await toPersistentImageUri(result.imageUri);
    if (!stored) throw new Error('Could not save the generated image.');
    await recipeOperations.update(recipeId, { imageUri: stored });
    await recipeOperations.setProvenance(recipeId, { imageSource: 'ai' });
    return stored;
}

async function runForCard<M extends AmpiMessageSlice>(
    messageId: string,
    card: RecipeCard,
    updateMessages: MessageCardsUpdater<M>
) {
    patchRecipeCard(updateMessages, messageId, card.recipe.id, { autoImage: { status: 'loading' } });
    try {
        const uri = await generateAndPersistRecipeImage(card.recipe.id);
        patchRecipeCard(updateMessages, messageId, card.recipe.id, {
            recipe: { ...card.recipe, image_uri: uri },
            autoImage: undefined,
        });
    } catch (error) {
        const message = (error as Error)?.message || 'Could not generate image.';
        if (message.includes('already has')) return;
        patchRecipeCard(updateMessages, messageId, card.recipe.id, {
            autoImage: { status: 'failed', errorMessage: message },
        });
    }
}

export async function retryAutoRecipeImage<M extends AmpiMessageSlice>(
    messageId: string,
    card: RecipeCard,
    updateMessages: MessageCardsUpdater<M>
) {
    await runForCard(messageId, card, updateMessages);
}

export function beginAutoRecipeImagesForMessage<M extends AmpiMessageSlice>(
    messageId: string,
    cards: SousCard[] | undefined,
    updateMessages: MessageCardsUpdater<M>
) {
    void (async () => {
        if (!(await isAutoRecipeImageEnabled())) return;
        if (!(await isAiConfigured())) return;
        const targets = (cards || []).filter(
            (c): c is RecipeCard => c.type === 'recipe' && recipeCardNeedsAutoImage(c)
        );
        if (!targets.length) return;
        updateMessages((prev) =>
            prev.map((m) => {
                if (m.id !== messageId || !m.cards) return m;
                return {
                    ...m,
                    cards: m.cards.map((c) =>
                        c.type === 'recipe' && recipeCardNeedsAutoImage(c)
                            ? { ...c, autoImage: { status: 'loading' } }
                            : c
                    ),
                };
            })
        );
        for (const card of targets) {
            await runForCard(messageId, card, updateMessages);
        }
    })();
}
