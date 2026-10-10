import {
    groceryOperations,
    pantryOperations,
    recipeOperations,
    partyOperations,
    mealPlanOperations,
} from '../database/operations';
import { getStartOfWeek, getWeekDates } from '../utils/dateHelpers';
import { prefetchQuery } from './queryCache';

const isoDay = (d) => d.toISOString().split('T')[0];

export const groceryQuery = { key: 'grocery', fetch: async () => (await groceryOperations.getAll()) || [] };
export const pantryQuery = { key: 'pantry', fetch: async () => (await pantryOperations.getAll()) || [] };
export const recipesQuery = { key: 'recipes', fetch: async () => (await recipeOperations.getAll()) || [] };
export const partiesQuery = { key: 'parties', fetch: async () => (await partyOperations.getAll()) || [] };

export function mealPlansQuery(weekStart) {
    const dates = getWeekDates(weekStart);
    return {
        key: `mealPlans:${isoDay(dates[0])}`,
        fetch: async () => (await mealPlanOperations.getByDateRange(isoDay(dates[0]), isoDay(dates[6]))) || [],
    };
}

/** Warm the caches for the data-backed tabs so a first visit renders filled. */
export function prefetchTabData() {
    const plans = mealPlansQuery(getStartOfWeek());
    return Promise.all(
        [groceryQuery, pantryQuery, recipesQuery, partiesQuery, plans].map((q) => prefetchQuery(q.key, q.fetch))
    );
}
