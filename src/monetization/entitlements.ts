import AsyncStorage from '@react-native-async-storage/async-storage';
import { creditPackFor, isSubscriptionSku } from './products';

// Local cache of what this device has bought. It drives the UI and routing
// only: until the backend in PLATFORM_AI.md exists, nothing here is verified,
// and the server ledger must become the source of truth for credits.

const STORAGE_KEY = 'amplifood.entitlements.v1';
const MAX_REMEMBERED_TRANSACTIONS = 200;

export type PlusEntitlement = {
    active: boolean;
    productId: string | null;
    since: number | null;
    expiresAt: number | null;
    willRenew: boolean | null;
};

export type EntitlementState = {
    plus: PlusEntitlement;
    /** Credits from consumable packs on this device. Unverified. */
    purchasedCredits: number;
    verified: false;
    processedTransactionIds: string[];
    updatedAt: number | null;
};

export type StorePurchase = {
    productId: string;
    transactionId: string;
    transactionDate: number;
    expiresAt?: number | null;
    isAutoRenewing?: boolean | null;
};

export const EMPTY_ENTITLEMENTS: EntitlementState = {
    plus: { active: false, productId: null, since: null, expiresAt: null, willRenew: null },
    purchasedCredits: 0,
    verified: false,
    processedTransactionIds: [],
    updatedAt: null,
};

type Listener = (state: EntitlementState) => void;
const listeners = new Set<Listener>();
let cache: EntitlementState | null = null;

export async function loadEntitlements(): Promise<EntitlementState> {
    if (cache) return cache;
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        cache = raw ? { ...EMPTY_ENTITLEMENTS, ...(JSON.parse(raw) as Partial<EntitlementState>) } : EMPTY_ENTITLEMENTS;
    } catch {
        cache = EMPTY_ENTITLEMENTS;
    }
    return cache;
}

async function save(next: EntitlementState): Promise<EntitlementState> {
    cache = { ...next, updatedAt: Date.now() };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    listeners.forEach((listener) => listener(cache as EntitlementState));
    return cache;
}

export function subscribeEntitlements(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function isPlusActive(plus: PlusEntitlement, now = Date.now()): boolean {
    return plus.active && (plus.expiresAt == null || plus.expiresAt > now);
}

export function hasPlus(state: EntitlementState): boolean {
    return isPlusActive(state.plus);
}

/** Whether a user without their own key should be routed to platform AI. */
export function canUsePlatformAi(state: EntitlementState): boolean {
    return hasPlus(state) || state.purchasedCredits > 0;
}

export async function hasPlatformAiAccess(): Promise<boolean> {
    return canUsePlatformAi(await loadEntitlements());
}

/** Record one finished store transaction. Safe to call twice for the same one. */
export async function applyPurchase(purchase: StorePurchase): Promise<EntitlementState> {
    const state = await loadEntitlements();
    if (state.processedTransactionIds.includes(purchase.transactionId)) {
        return state;
    }
    const processedTransactionIds = [...state.processedTransactionIds, purchase.transactionId].slice(
        -MAX_REMEMBERED_TRANSACTIONS
    );

    if (isSubscriptionSku(purchase.productId)) {
        return save({
            ...state,
            processedTransactionIds,
            plus: {
                active: true,
                productId: purchase.productId,
                since: state.plus.since ?? purchase.transactionDate,
                expiresAt: purchase.expiresAt ?? null,
                willRenew: purchase.isAutoRenewing ?? null,
            },
        });
    }

    const pack = creditPackFor(purchase.productId);
    if (!pack) return state;
    return save({
        ...state,
        processedTransactionIds,
        purchasedCredits: state.purchasedCredits + pack.credits,
    });
}

/**
 * Rebuild the Plus entitlement from the store's list of active purchases
 * (restore, or app start). Consumables never appear here once finished.
 */
export async function syncSubscriptions(active: StorePurchase[]): Promise<EntitlementState> {
    const state = await loadEntitlements();
    const subscription = active
        .filter((purchase) => isSubscriptionSku(purchase.productId))
        .sort((a, b) => b.transactionDate - a.transactionDate)[0];
    const plus: PlusEntitlement = subscription
        ? {
              active: true,
              productId: subscription.productId,
              since: state.plus.since ?? subscription.transactionDate,
              expiresAt: subscription.expiresAt ?? null,
              willRenew: subscription.isAutoRenewing ?? null,
          }
        : EMPTY_ENTITLEMENTS.plus;
    return save({ ...state, plus });
}
