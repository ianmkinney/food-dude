import { getApiBaseUrl } from '../config/api';
import { getOwnerSessionToken } from '../platform/ownerSession';
import type {
    CreditBalance,
    PlatformAiClient,
    PlatformImageRequest,
    PlatformMultimodalRequest,
    PlatformTextRequest,
    PurchaseVerification,
} from './platformAi';
import { PlatformAiNotLiveError } from './platformAi';
import type { StorePurchase } from './entitlements';

async function ownerChat(body: Record<string, unknown>): Promise<string> {
    const token = await getOwnerSessionToken();
    if (!token) {
        throw new PlatformAiNotLiveError();
    }
    const response = await fetch(`${getApiBaseUrl()}/ai/chat`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...body, stream: false }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 429) {
        throw new Error(payload?.message || "You've hit today's owner AI limit. Try again tomorrow.");
    }
    if (!response.ok) {
        throw new Error(payload?.message || 'Owner platform AI request failed.');
    }
    const text = payload?.text;
    if (!text) {
        throw new Error('The model returned an empty response.');
    }
    return text;
}

/** Owner-only OpenRouter proxy. Store purchases stay on the stub path (`isLive: false`). */
export const livePlatformAi: PlatformAiClient = {
    isLive: false,
    getBalance: async (): Promise<CreditBalance | null> => null,
    verifyPurchase: async (): Promise<PurchaseVerification> => ({
        status: 'unavailable',
        reason: 'Store verification is not live yet.',
    }),
    generateText: async (request: PlatformTextRequest) =>
        ownerChat({ prompt: request.prompt, feature: request.feature }),
    generateMultimodal: async (request: PlatformMultimodalRequest) =>
        ownerChat({
            prompt: request.prompt,
            feature: request.feature,
            images: request.images?.map((img) => ({ data: img.data, mimeType: img.mimeType })),
        }),
    generateImage: async (_request: PlatformImageRequest) => {
        throw new Error(
            'Recipe image generation on owner platform AI is not supported yet. Add a Gemini API key in Account.'
        );
    },
};
