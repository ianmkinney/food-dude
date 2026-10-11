import { useEffect } from 'react';
import { subscribeSyncData } from '../sync/syncEvents';

/** Re-run `reload` when cloud sync or party live data changes in this tab. */
export function useSyncDataRefresh(reload: () => void | Promise<void>) {
    useEffect(() => {
        return subscribeSyncData(() => {
            void reload();
        });
    }, [reload]);
}
