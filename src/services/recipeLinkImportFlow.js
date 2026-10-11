import { Platform } from 'react-native';
import { parseRecipeFromUrl } from './recipeParser';
import { friendlyMediaErrorMessage } from './mediaTypes';
import { isSocialPostUrl, socialImportFallbackHint, isWebRecipeUrlImportError } from './recipeUrlImport';
import { hasOwnerSession } from '../platform/ownerSession';

const SIGN_IN_MESSAGE =
    'Sign in with Google on the Account tab to import recipe links on the web and social posts.';

export function recipeLinkImportStatus(url) {
    const trimmed = String(url || '').trim().toLowerCase();
    if (trimmed.includes('tiktok.com')) return 'Reading TikTok description…';
    if (trimmed.includes('instagram.com')) return 'Reading Instagram caption…';
    return 'Fetching recipe from link…';
}

export function recipeLinkNeedsOwnerSession(url) {
    const trimmed = String(url || '').trim();
    return Platform.OS === 'web' || isSocialPostUrl(trimmed);
}

export function formatRecipeLinkImportError(inputUrl, errorMessage) {
    const friendly = friendlyMediaErrorMessage(errorMessage) || errorMessage || 'Failed to import that link.';
    if (friendly.includes(SIGN_IN_MESSAGE) || errorMessage === 'unauthorized') {
        return { message: SIGN_IN_MESSAGE, needsSignIn: true };
    }
    const isUrl = /^(http|https):\/\//i.test(String(inputUrl || '').trim());
    const isSocial = isUrl && isSocialPostUrl(inputUrl);
    const hint =
        isUrl && (Platform.OS === 'web' || isSocial)
            ? isSocial
                ? socialImportFallbackHint(inputUrl)
                : ' Try pasting the recipe text below, or use a screenshot.'
            : '';
    const needsSignIn = isWebRecipeUrlImportError(friendly) && friendly.toLowerCase().includes('sign in');
    return { message: `${friendly}${hint}`, needsSignIn };
}

/**
 * Import a public recipe URL through /api/recipes/import (web & social) or native fetch.
 * @param {string} url
 * @param {{ onStatus?: (msg: string) => void }} options
 */
export async function importRecipeFromLink(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!/^(http|https):\/\/\S+$/i.test(trimmed)) {
        return { success: false, error: 'Enter a valid https:// link.' };
    }

    if (recipeLinkNeedsOwnerSession(trimmed) && !(await hasOwnerSession())) {
        return { success: false, error: 'unauthorized', message: SIGN_IN_MESSAGE, needsSignIn: true };
    }

    options.onStatus?.(recipeLinkImportStatus(trimmed));
    const result = await parseRecipeFromUrl(trimmed);
    if (!result.success) {
        const formatted = formatRecipeLinkImportError(trimmed, result.error);
        return { success: false, error: formatted.message, needsSignIn: formatted.needsSignIn };
    }

    options.onStatus?.('Finalizing…');
    const recipe = {
        ...result.recipe,
        aiExtracted: Boolean(result.aiExtracted || result.recipe?.aiExtracted),
    };
    return { success: true, recipe, aiExtracted: recipe.aiExtracted };
}
