import AsyncStorage from '@react-native-async-storage/async-storage';
import { getElevenLabsKey } from './voiceSettings';

// Who can use the Premium Sous voice: Plus subscribers (served by the AmpliFood
// voice proxy) or anyone with their own ElevenLabs key.
//
// Plus status is read from the entitlement cache written by the paywall (#11,
// src/monetization/entitlements.ts, key below), so this module doesn't depend
// on the purchase code. Keep the key and shape in sync with that file.
const ENTITLEMENTS_KEY = 'amplifood.entitlements.v1';

export async function hasPlusEntitlement(): Promise<boolean> {
    try {
        const raw = await AsyncStorage.getItem(ENTITLEMENTS_KEY);
        if (!raw) return false;
        const plus = (JSON.parse(raw) as { plus?: { active?: boolean; expiresAt?: number | null } }).plus;
        return !!plus?.active && (plus.expiresAt == null || plus.expiresAt > Date.now());
    } catch {
        return false;
    }
}

export type PremiumVoiceAccess = { via: 'byok' | 'plus' | null };

/** Your own key wins (billed to you); otherwise Plus; otherwise not available. */
export async function getPremiumVoiceAccess(): Promise<PremiumVoiceAccess> {
    if (await getElevenLabsKey()) return { via: 'byok' };
    if (await hasPlusEntitlement()) return { via: 'plus' };
    return { via: null };
}
