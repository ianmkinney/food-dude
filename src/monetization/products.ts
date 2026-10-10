// AmpliFood pricing, locked by Ian (Oct 2026). Store prices win at runtime; the
// list prices here are only shown when the store can't be reached (and on web).

export const PLUS_MONTHLY_SKU = 'amplifood_plus_monthly';

export const SUBSCRIPTION_SKUS = [PLUS_MONTHLY_SKU] as const;

export const PLUS_MONTHLY_CREDITS = 200;

export type CreditPack = {
    sku: string;
    credits: number;
    listPrice: string;
};

export const CREDIT_PACKS: readonly CreditPack[] = [
    { sku: 'amplifood_credits_40', credits: 40, listPrice: '$1.99' },
    { sku: 'amplifood_credits_120', credits: 120, listPrice: '$4.99' },
    { sku: 'amplifood_credits_350', credits: 350, listPrice: '$12.99' },
];

export const CREDIT_PACK_SKUS = CREDIT_PACKS.map((pack) => pack.sku);

export type SubscriptionPlan = {
    sku: string;
    period: 'month';
    listPrice: string;
};

export const PLUS_PLANS: readonly SubscriptionPlan[] = [
    { sku: PLUS_MONTHLY_SKU, period: 'month', listPrice: '$6.99' },
];

export function creditPackFor(sku: string): CreditPack | undefined {
    return CREDIT_PACKS.find((pack) => pack.sku === sku);
}

export function isSubscriptionSku(sku: string): boolean {
    return (SUBSCRIPTION_SKUS as readonly string[]).includes(sku);
}

/**
 * Provisional credit cost per platform-AI action. The server's ledger is the
 * authority; the client only uses these to explain costs up front.
 */
export const CREDIT_COSTS = {
    chat: 1,
    costEstimate: 1,
    textImport: 2,
    imageImport: 3,
    recipeImage: 5,
} as const;

export type PlatformAiFeature = keyof typeof CREDIT_COSTS;
