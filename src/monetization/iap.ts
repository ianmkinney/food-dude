import type { Product, ProductSubscription, Purchase, PurchaseError } from 'expo-iap';
import { CREDIT_PACK_SKUS, SUBSCRIPTION_SKUS, isSubscriptionSku } from './products';
import type { StorePurchase } from './entitlements';

export type StoreProduct = {
    sku: string;
    title: string;
    displayPrice: string;
};

export type IapHandlers = {
    /** Called for every completed store transaction, before it is finished. */
    onPurchase: (purchase: StorePurchase, finish: () => Promise<void>) => Promise<void>;
    onError: (message: string) => void;
};

export const isIapSupported = true;

type ExpoIap = typeof import('expo-iap');
let iap: ExpoIap | null = null;
let connected = false;
let subscriptionOffers = new Map<string, string>();

// expo-iap is a native module: missing in Expo Go and older dev builds.
async function loadIap(): Promise<ExpoIap | null> {
    if (iap) return iap;
    try {
        iap = await import('expo-iap');
    } catch {
        iap = null;
    }
    return iap;
}

export function toStorePurchase(purchase: Purchase): StorePurchase {
    const expiresAt = 'expirationDateIOS' in purchase ? purchase.expirationDateIOS ?? null : null;
    return {
        productId: purchase.productId,
        transactionId: purchase.id || purchase.purchaseToken || `${purchase.productId}:${purchase.transactionDate}`,
        transactionDate: purchase.transactionDate,
        expiresAt,
        isAutoRenewing: purchase.isAutoRenewing,
    };
}

function describeError(error: PurchaseError | Error | unknown): string {
    const code = (error as PurchaseError)?.code;
    if (code === 'user-cancelled') return '';
    return (error as Error)?.message || 'The store could not complete the purchase.';
}

/** Connect to the App Store / Play Billing and start listening. Returns a disconnect function. */
export async function connectStore(handlers: IapHandlers): Promise<() => void> {
    const mod = await loadIap();
    if (!mod) {
        handlers.onError('Purchases need the AmpliFood app from the App Store or Google Play.');
        return () => {};
    }
    try {
        await mod.initConnection();
        connected = true;
    } catch (error) {
        handlers.onError(describeError(error) || 'Could not reach the store.');
        return () => {};
    }

    const updated = mod.purchaseUpdatedListener((purchase: Purchase) => {
        if (purchase.purchaseState !== 'purchased') return;
        const consumable = !isSubscriptionSku(purchase.productId);
        handlers
            .onPurchase(toStorePurchase(purchase), async () => {
                await mod.finishTransaction({ purchase, isConsumable: consumable });
            })
            .catch((error) => handlers.onError(describeError(error)));
    });
    const failed = mod.purchaseErrorListener((error) => {
        const message = describeError(error);
        if (message) handlers.onError(message);
    });

    return () => {
        updated.remove();
        failed.remove();
        if (connected) {
            connected = false;
            mod.endConnection().catch(() => {});
        }
    };
}

export async function loadStoreProducts(): Promise<StoreProduct[]> {
    const mod = await loadIap();
    if (!mod || !connected) return [];
    const [subs, packs] = await Promise.all([
        mod.fetchProducts({ skus: [...SUBSCRIPTION_SKUS], type: 'subs' }),
        mod.fetchProducts({ skus: CREDIT_PACK_SKUS, type: 'in-app' }),
    ]);
    const all = [...((subs ?? []) as ProductSubscription[]), ...((packs ?? []) as Product[])];
    subscriptionOffers = new Map();
    for (const product of all) {
        if (product.type === 'subs') {
            const token = (product as ProductSubscription).subscriptionOffers?.find((o) => o.offerTokenAndroid)
                ?.offerTokenAndroid;
            if (token) subscriptionOffers.set(product.id, token);
        }
    }
    return all.map((product) => ({ sku: product.id, title: product.title, displayPrice: product.displayPrice }));
}

/** Starts the store sheet. The outcome arrives through `onPurchase` / `onError`. */
export async function startPurchase(sku: string): Promise<void> {
    const mod = await loadIap();
    if (!mod || !connected) {
        throw new Error('The store is not available right now.');
    }
    if (isSubscriptionSku(sku)) {
        const offerToken = subscriptionOffers.get(sku);
        await mod.requestPurchase({
            type: 'subs',
            request: {
                apple: { sku },
                google: {
                    skus: [sku],
                    ...(offerToken ? { subscriptionOffers: [{ sku, offerToken }] } : null),
                },
            },
        });
        return;
    }
    await mod.requestPurchase({
        type: 'in-app',
        request: { apple: { sku }, google: { skus: [sku] } },
    });
}

/** Ask the store for everything this account owns that is still active. */
export async function restoreStorePurchases(): Promise<StorePurchase[]> {
    const mod = await loadIap();
    if (!mod || !connected) {
        throw new Error('The store is not available right now.');
    }
    await mod.restorePurchases();
    const purchases = await mod.getAvailablePurchases();
    return (purchases ?? []).map(toStorePurchase);
}
