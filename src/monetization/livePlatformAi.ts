import { getApiBaseUrl } from '../config/api';
import { getOwnerSessionToken } from '../platform/ownerSession';
import { getOwnerChatModelPreference, getOwnerImageModelPreference } from '../platform/ownerModelPreferences';
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
    visionNote?: string;
    latencyMs?: number;
    error?: string;
    message?: string;
};

export type OwnerMultimodalResult = { text: string; visionNote?: string | null };

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

async function ownerChatBody(extra: Record<string, unknown>): Promise<Record<string, unknown>> {
    const model = await getOwnerChatModelPreference();
    return model ? { ...extra, model } : extra;
}

async function ownerChat(body: Record<string, unknown>): Promise<OwnerMultimodalResult> {
    const payload = await postOwnerChat(await ownerChatBody(body));
    const text = payload?.text;
    if (!text) {
        throw new Error('The model returned an empty response.');
    }
    return { text, visionNote: payload.visionNote || null };
}

export type OwnerAiTestResult = { model: string; latencyMs: number; fallbackFrom?: string };

/** One tiny request through the owner proxy, for the Account status "Test" button. */
export async function testOwnerAi(): Promise<OwnerAiTestResult> {
    const started = Date.now();
    const payload = await postOwnerChat(await ownerChatBody({ test: true, prompt: 'test' }));
    return {
        model: payload.model || 'unknown',
        latencyMs: payload.latencyMs ?? Date.now() - started,
        fallbackFrom: payload.fallbackFrom,
    };
}

function ownerMultimodalBody(request: PlatformMultimodalRequest): Record<string, unknown> {
    const body: Record<string, unknown> = { feature: request.feature };
    if (request.system && request.turns?.length) {
        body.system = request.system;
        body.turns = request.turns.map((t) => ({
            role: t.role,
            text: t.text,
            images: t.images?.map((img) => ({ data: img.data, mimeType: img.mimeType })),
        }));
    } else {
        body.prompt = request.prompt;
        body.images = request.images?.map((img) => ({ data: img.data, mimeType: img.mimeType }));
    }
    return body;
}

/** Structured or legacy multimodal chat through the owner proxy. */
export async function platformOwnerMultimodal(request: PlatformMultimodalRequest): Promise<OwnerMultimodalResult> {
    return ownerChat(await ownerChatBody(ownerMultimodalBody(request)));
}

/** Owner-only OpenRouter proxy. Store purchases stay on the stub path (`isLive: false`). */
export const livePlatformAi: PlatformAiClient = {
    isLive: false,
    getBalance: async (): Promise<CreditBalance | null> => null,
    verifyPurchase: async (): Promise<PurchaseVerification> => ({
        status: 'unavailable',
        reason: 'Store verification is not live yet.',
    }),
    generateText: async (request: PlatformTextRequest) => {
        const result = await ownerChat(await ownerChatBody({ prompt: request.prompt, feature: request.feature }));
        return result.text;
    },
    generateMultimodal: async (request: PlatformMultimodalRequest) => {
        const result = await platformOwnerMultimodal(request);
        return result.text;
    },
    generateImage: async (request: PlatformImageRequest) => {
        const imageModel = await getOwnerImageModelPreference();
        const payload = await postOwnerChat({
            mode: 'image',
            prompt: request.prompt,
            ...(imageModel ? { model: imageModel } : null),
        });
        const imageUri = payload?.imageUri;
        if (!imageUri) {
            throw new Error('The image model returned no photo. Try again later.');
        }
        return { imageUri };
    },
};
