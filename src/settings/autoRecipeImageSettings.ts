import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'amplifood.ai.autoRecipeImages';

/** Default on: generate a cover when Ampi saves a recipe without a photo. */
export async function isAutoRecipeImageEnabled(): Promise<boolean> {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === null) return true;
    return raw === 'true';
}

export async function setAutoRecipeImageEnabled(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(KEY, String(enabled));
}
