import { getApiBaseUrl } from '../config/api';
import { getOwnerSessionToken } from './ownerSession';

export type OpenRouterModelRow = {
    id: string;
    name: string;
    pricePerMillion: number | null;
    pricePerMillionPrompt?: number | null;
    pricePerMillionCompletion?: number | null;
};

export type OwnerModelsCatalog = {
    defaults: { chat: string; image: string };
    chatModels: OpenRouterModelRow[];
    imageModels: OpenRouterModelRow[];
};

export async function fetchOwnerOpenRouterModels(): Promise<OwnerModelsCatalog> {
    const token = await getOwnerSessionToken();
    if (!token) {
        throw new Error('Sign in with an allowlisted Google account first.');
    }
    const response = await fetch(`${getApiBaseUrl()}/ai/chat`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: 'models' }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(body?.message || body?.error || `Models request failed (${response.status})`);
    }
    return body as OwnerModelsCatalog;
}
