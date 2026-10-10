import type { PlatformAiFeature } from './products';
import type { StorePurchase } from './entitlements';

// AmpliFood-hosted AI ("platform AI") for people without their own key. The
// app only talks to it through this interface; PLATFORM_AI.md describes the
// backend that has to exist before `livePlatformAi` can replace the stub.

export type PlatformImage = { data: string; mimeType: string };

export type PlatformTextRequest = { prompt: string; feature: PlatformAiFeature };
export type PlatformMultimodalRequest = PlatformTextRequest & {
    images?: PlatformImage[];
    video?: PlatformImage | null;
};
export type PlatformImageRequest = { prompt: string };

export type CreditBalance = {
    /** Credits left from this month's Plus allowance. */
    monthlyRemaining: number;
    /** Credits from packs; these don't expire. */
    purchasedRemaining: number;
    /** When the monthly allowance next refills (ms since epoch). */
    resetsAt: number | null;
};

export type PurchaseVerification =
    | { status: 'verified'; balance: CreditBalance; plusExpiresAt: number | null }
    | { status: 'rejected'; reason: string }
    | { status: 'unavailable'; reason: string };

export interface PlatformAiClient {
    /** False until the backend is deployed and this client points at it. */
    readonly isLive: boolean;
    getBalance(): Promise<CreditBalance | null>;
    /** Validate a store transaction and credit the ledger; must run before finishing consumables in production. */
    verifyPurchase(purchase: StorePurchase): Promise<PurchaseVerification>;
    generateText(request: PlatformTextRequest): Promise<string>;
    generateMultimodal(request: PlatformMultimodalRequest): Promise<string>;
    generateImage(request: PlatformImageRequest): Promise<{ imageUri: string }>;
}

export class PlatformAiNotLiveError extends Error {
    constructor() {
        super(
            "AmpliFood AI isn't switched on yet, so no credits were used. Add your own AI key in Account to use AI features today."
        );
        this.name = 'PlatformAiNotLiveError';
    }
}

const notLive = async (): Promise<never> => {
    throw new PlatformAiNotLiveError();
};

export const stubPlatformAi: PlatformAiClient = {
    isLive: false,
    getBalance: async () => null,
    verifyPurchase: async () => ({ status: 'unavailable', reason: 'No AmpliFood backend yet.' }),
    generateText: notLive,
    generateMultimodal: notLive,
    generateImage: notLive,
};

import { livePlatformAi } from './livePlatformAi';

/** Owner OpenRouter proxy when signed in; purchase verification still stubbed. */
export const platformAi: PlatformAiClient = {
    ...stubPlatformAi,
    generateText: livePlatformAi.generateText,
    generateMultimodal: livePlatformAi.generateMultimodal,
    generateImage: livePlatformAi.generateImage,
};
