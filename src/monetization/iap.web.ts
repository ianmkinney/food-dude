import type { StorePurchase } from './entitlements';
import type { IapHandlers, StoreProduct } from './iap';

// Plus and credit packs are sold through the App Store and Google Play only.
// The web build shows the plans and points people to the mobile app; BYOK keeps
// working in the browser.

export type { IapHandlers, StoreProduct };

export const isIapSupported = false;

export async function connectStore(_handlers: IapHandlers): Promise<() => void> {
    return () => {};
}

export async function loadStoreProducts(): Promise<StoreProduct[]> {
    return [];
}

export async function startPurchase(_sku: string): Promise<void> {
    throw new Error('Purchases are available in the AmpliFood mobile app.');
}

export async function restoreStorePurchases(): Promise<StorePurchase[]> {
    throw new Error('Restore purchases in the AmpliFood mobile app.');
}
