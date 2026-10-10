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

/** Carries the HTTP status and server error code so the chat can show the real reason. */
export class OwnerAiError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, reason: string) {
        super(status ? `Owner AI error ${status}${code ? ` (${code})` : ''}: ${reason}` : `Owner AI error: ${reason}`);
        this.name = 'OwnerAiError';
        this.status = status;
        this.code = code;
    }
}

type ChatPayload = {
    text?: string;
    imageUri?: string;
    model?: string;
    fallbackFrom?: string;
    latencyMs?: number;
    error?: string;
    message?: string;
};

async function postOwnerChat(body: Record<string, unknown>): Promise<ChatPayload> {
    const token = await getOwnerSessionToken();
    if (!token) {
        throw new PlatformAiNotLiveError();
    }
    const url = `${getApiBaseUrl()}/ai/chat`;
    let response: Response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ...body, stream: false }),
        });
    } catch (error) {
        throw new OwnerAiError(0, 'network', `couldn't reach ${url} (${(error as Error)?.message || 'network error'})`);
    }
    const raw = await response.text().catch(() => '');
    let payload: ChatPayload = {};
    try {
        payload = raw ? JSON.parse(raw) : {};
    } catch {
        // Non-JSON (e.g. a platform 404/504 page); report a snippet below.
    }
    if (!response.ok) {
        const reason =
            payload?.message ||
            payload?.error ||
            raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) ||
            response.statusText ||
            'request failed';
        throw new OwnerAiError(response.status, payload?.error || '', reason);
    }
    return payload;
}

async function ownerChat(body: Record<string, unknown>): Promise<string> {
    const payload = await postOwnerChat(body);
    const text = payload?.text;
    if (!text) {
        throw new Error('The model returned an empty response.');
    }
    return text;
}

export type OwnerAiTestResult = { model: string; latencyMs: number; fallbackFrom?: string };

/** One tiny request through the owner proxy, for the Account status "Test" button. */
export async function testOwnerAi(): Promise<OwnerAiTestResult> {
    const started = Date.now();
    const payload = await postOwnerChat({ test: true, prompt: 'test' });
    return {
        model: payload.model || 'unknown',
        latencyMs: payload.latencyMs ?? Date.now() - started,
        fallbackFrom: payload.fallbackFrom,
    };
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
    generateImage: async (request: PlatformImageRequest) => {
        const payload = await postOwnerChat({ mode: 'image', prompt: request.prompt });
        const imageUri = payload?.imageUri;
        if (!imageUri) {
            throw new Error('The image model returned no photo. Try again later.');
        }
        return { imageUri };
    },
};
