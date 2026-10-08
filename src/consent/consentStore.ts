import AsyncStorage from '@react-native-async-storage/async-storage';

// Terms/Privacy acceptance and per-provider permission to send data to AI or
// voice services (App Store guideline 5.1.2(i)). Stored on the device only.

export const TERMS_URL = 'https://amplifood.vercel.app/terms';
export const PRIVACY_URL = 'https://amplifood.vercel.app/privacy';

/** Bump when the Terms or Privacy Policy change materially; users accept again. */
export const LEGAL_VERSION = '2026-10-08';

const LEGAL_KEY = 'amplifood.legal.accepted';
const CONSENT_KEY = 'amplifood.dataConsent.v1';

export type ConsentTarget = 'anthropic' | 'openai' | 'xai' | 'gemini' | 'elevenlabs';

export const TARGETS: Record<ConsentTarget, { name: string; sends: string; policy: string }> = {
    anthropic: {
        name: 'Anthropic (Claude)',
        sends: 'your messages and requests, recipe text, links and photos you add, and, when relevant, your saved recipe names, pantry items, flavor preferences and allergies',
        policy: 'https://www.anthropic.com/legal/privacy',
    },
    openai: {
        name: 'OpenAI',
        sends: 'your messages and requests, recipe text, links and photos you add, and, when relevant, your saved recipe names, pantry items, flavor preferences and allergies',
        policy: 'https://openai.com/policies/privacy-policy',
    },
    xai: {
        name: 'xAI (Grok)',
        sends: 'your messages and requests, recipe text, links and photos you add, and, when relevant, your saved recipe names, pantry items, flavor preferences and allergies',
        policy: 'https://x.ai/legal/privacy-policy',
    },
    gemini: {
        name: 'Google (Gemini)',
        sends: 'your messages and requests, recipe text, links and photos you add, and, when relevant, your saved recipe names, pantry items, flavor preferences and allergies',
        policy: 'https://policies.google.com/privacy',
    },
    elevenlabs: {
        name: 'ElevenLabs',
        sends: 'the text of Sous replies you choose to hear read aloud',
        policy: 'https://elevenlabs.io/privacy-policy',
    },
};

export type LegalAcceptance = { version: string; acceptedAt: number };

export async function getLegalAcceptance(): Promise<LegalAcceptance | null> {
    try {
        const raw = await AsyncStorage.getItem(LEGAL_KEY);
        return raw ? (JSON.parse(raw) as LegalAcceptance) : null;
    } catch {
        return null;
    }
}

export async function acceptLegal(): Promise<void> {
    const value: LegalAcceptance = { version: LEGAL_VERSION, acceptedAt: Date.now() };
    await AsyncStorage.setItem(LEGAL_KEY, JSON.stringify(value));
}

type ConsentMap = Partial<Record<ConsentTarget, { grantedAt: number }>>;

async function readConsents(): Promise<ConsentMap> {
    try {
        const raw = await AsyncStorage.getItem(CONSENT_KEY);
        return raw ? (JSON.parse(raw) as ConsentMap) : {};
    } catch {
        return {};
    }
}

export async function getConsents(): Promise<ConsentMap> {
    return readConsents();
}

export async function hasConsent(target: ConsentTarget): Promise<boolean> {
    return Boolean((await readConsents())[target]);
}

export async function grantConsent(target: ConsentTarget): Promise<void> {
    const map = await readConsents();
    map[target] = { grantedAt: Date.now() };
    await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify(map));
}

export async function revokeConsent(target: ConsentTarget): Promise<void> {
    const map = await readConsents();
    delete map[target];
    await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify(map));
}

// The prompt UI registers itself here (ConsentHost); service code awaits it.
type Asker = (target: ConsentTarget) => Promise<boolean>;
let asker: Asker | null = null;
export function registerConsentAsker(fn: Asker | null) {
    asker = fn;
}

export class ConsentDeclinedError extends Error {
    constructor(target: ConsentTarget) {
        super(
            `Nothing was sent. AI features stay off until you allow sharing with ${TARGETS[target].name}. You can allow it next time, or in Account → Data sharing.`
        );
        this.name = 'ConsentDeclinedError';
    }
}

/** Resolves once the user has allowed sending data to `target`, or throws. */
export async function ensureConsent(target: ConsentTarget): Promise<void> {
    if (await hasConsent(target)) return;
    const allowed = asker ? await asker(target) : false;
    if (!allowed) throw new ConsentDeclinedError(target);
    await grantConsent(target);
}
