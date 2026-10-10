import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
    EMPTY_ENTITLEMENTS,
    applyPurchase,
    canUsePlatformAi,
    hasPlus,
    loadEntitlements,
    subscribeEntitlements,
    syncSubscriptions,
    type EntitlementState,
} from './entitlements';
import {
    connectStore,
    isIapSupported,
    loadStoreProducts,
    restoreStorePurchases,
    startPurchase,
    type StoreProduct,
} from './iap';
import { platformAi, type CreditBalance } from './platformAi';

type MonetizationValue = {
    entitlements: EntitlementState;
    isPlus: boolean;
    canUsePlatformAi: boolean;
    /** Server balance once platform AI is live; null while stubbed. */
    balance: CreditBalance | null;
    isIapSupported: boolean;
    storeReady: boolean;
    products: Record<string, StoreProduct>;
    busySku: string | null;
    restoring: boolean;
    lastError: string | null;
    lastPurchase: string | null;
    buy: (sku: string) => Promise<void>;
    restore: () => Promise<{ restoredPlus: boolean }>;
    clearMessages: () => void;
};

const MonetizationContext = createContext<MonetizationValue | null>(null);

export function MonetizationProvider({ children }: { children: React.ReactNode }) {
    const [entitlements, setEntitlements] = useState<EntitlementState>(EMPTY_ENTITLEMENTS);
    const [balance, setBalance] = useState<CreditBalance | null>(null);
    const [products, setProducts] = useState<Record<string, StoreProduct>>({});
    const [storeReady, setStoreReady] = useState(false);
    const [busySku, setBusySku] = useState<string | null>(null);
    const [restoring, setRestoring] = useState(false);
    const [lastError, setLastError] = useState<string | null>(null);
    const [lastPurchase, setLastPurchase] = useState<string | null>(null);

    useEffect(() => {
        loadEntitlements().then(setEntitlements);
        platformAi.getBalance().then(setBalance).catch(() => setBalance(null));
        return subscribeEntitlements(setEntitlements);
    }, []);

    useEffect(() => {
        if (!isIapSupported) return undefined;
        let disconnect: (() => void) | null = null;
        let cancelled = false;
        connectStore({
            onPurchase: async (purchase, finish) => {
                // Production order: verify + credit on the server, then finish.
                // While the backend is stubbed the grant is local and unverified.
                const verification = await platformAi.verifyPurchase(purchase);
                if (verification.status === 'rejected') {
                    setLastError(verification.reason);
                    return;
                }
                await applyPurchase(purchase);
                await finish();
                setBusySku(null);
                setLastPurchase(purchase.productId);
                if (verification.status === 'verified') setBalance(verification.balance);
            },
            onError: (message) => {
                setBusySku(null);
                setLastError(message);
            },
        }).then(async (stop) => {
            disconnect = stop;
            if (cancelled) {
                stop();
                return;
            }
            try {
                const list = await loadStoreProducts();
                if (cancelled) return;
                setProducts(Object.fromEntries(list.map((product) => [product.sku, product])));
                setStoreReady(true);
            } catch (error) {
                setLastError((error as Error)?.message || 'Could not load prices from the store.');
            }
        });
        return () => {
            cancelled = true;
            disconnect?.();
        };
    }, []);

    const buy = useCallback(async (sku: string) => {
        setLastError(null);
        setLastPurchase(null);
        setBusySku(sku);
        try {
            await startPurchase(sku);
        } catch (error) {
            setBusySku(null);
            setLastError((error as Error)?.message || 'The purchase could not start.');
        }
    }, []);

    const restore = useCallback(async () => {
        setLastError(null);
        setRestoring(true);
        try {
            const next = await syncSubscriptions(await restoreStorePurchases());
            return { restoredPlus: hasPlus(next) };
        } catch (error) {
            setLastError((error as Error)?.message || 'Could not restore purchases.');
            return { restoredPlus: false };
        } finally {
            setRestoring(false);
        }
    }, []);

    const clearMessages = useCallback(() => {
        setLastError(null);
        setLastPurchase(null);
    }, []);

    const value = useMemo<MonetizationValue>(
        () => ({
            entitlements,
            isPlus: hasPlus(entitlements),
            canUsePlatformAi: canUsePlatformAi(entitlements),
            balance,
            isIapSupported,
            storeReady,
            products,
            busySku,
            restoring,
            lastError,
            lastPurchase,
            buy,
            restore,
            clearMessages,
        }),
        [entitlements, balance, storeReady, products, busySku, restoring, lastError, lastPurchase, buy, restore, clearMessages]
    );

    return <MonetizationContext.Provider value={value}>{children}</MonetizationContext.Provider>;
}

export function useMonetization(): MonetizationValue {
    const value = useContext(MonetizationContext);
    if (!value) throw new Error('useMonetization must be used inside MonetizationProvider');
    return value;
}
