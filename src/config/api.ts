import { Platform } from 'react-native';

/** Base URL for AmpliFood serverless API (no trailing slash). */
export function getApiBaseUrl(): string {
    const explicit = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
    if (explicit) return explicit;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
        return `${window.location.origin}/api`;
    }
    return 'https://amplifood.vercel.app/api';
}
