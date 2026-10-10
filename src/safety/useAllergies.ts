import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { userOperations } from '../database/operations';
import { parseAllergies } from './allergens';

/** The user's allergies (raw text and parsed list), refreshed whenever the screen gains focus. */
export function useAllergies(): { raw: string | null; list: string[] } {
    const [raw, setRaw] = useState<string | null>(null);

    const load = useCallback(() => {
        userOperations
            .getCurrent()
            .then((user: { allergies?: string | null } | null) => setRaw(user?.allergies || null))
            .catch(() => setRaw(null));
    }, []);

    useEffect(load, [load]);
    useFocusEffect(load);

    return { raw, list: parseAllergies(raw) };
}
