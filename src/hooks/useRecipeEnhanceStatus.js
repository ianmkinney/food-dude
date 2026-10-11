import { useCallback, useEffect, useState } from 'react';
import {
    recipeEnhanceJobOperations,
    subscribeRecipeEnhanceJobs,
} from '../database/operations';

export function useRecipeEnhanceStatus(recipeId) {
    const [job, setJob] = useState(null);

    const refresh = useCallback(async () => {
        if (!recipeId) {
            setJob(null);
            return;
        }
        const active = await recipeEnhanceJobOperations.getActiveForRecipe(recipeId);
        if (active) {
            setJob(active);
            return;
        }
        const latest = await recipeEnhanceJobOperations.getLatestForRecipe(recipeId);
        setJob(latest?.status === 'failed' ? latest : null);
    }, [recipeId]);

    useEffect(() => {
        refresh();
        return subscribeRecipeEnhanceJobs(() => {
            refresh();
        });
    }, [refresh]);

    const enhancing = Boolean(job && (job.status === 'queued' || job.status === 'running'));
    const failed = job?.status === 'failed';

    return { enhancing, failed, job, refresh };
}

export function useActiveEnhanceRecipeIds() {
    const [ids, setIds] = useState(new Set());

    const refresh = useCallback(async () => {
        const list = await recipeEnhanceJobOperations.listActiveRecipeIds();
        setIds(new Set(list));
    }, []);

    useEffect(() => {
        refresh();
        return subscribeRecipeEnhanceJobs(refresh);
    }, [refresh]);

    return ids;
}
