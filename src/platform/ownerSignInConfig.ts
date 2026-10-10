import { Platform } from 'react-native';

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim();

/** Whether this build has the Google client ID needed for owner sign-in on the current platform. */
export function isOwnerSignInConfigured(): boolean {
    if (Platform.OS === 'web') return Boolean(webClientId);
    if (Platform.OS === 'ios') return Boolean(iosClientId && webClientId);
    if (Platform.OS === 'android') return Boolean(androidClientId && webClientId);
    return false;
}

export function getOwnerGoogleClientIds() {
    return { webClientId, iosClientId, androidClientId };
}
