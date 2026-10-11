import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import type { AuthSessionProfile, OwnerSession } from '../platform/ownerSession';
import { isGoogleSignInConfigured } from '../platform/ownerSignInConfig';
import {
    completeGoogleSignIn,
    consumePendingWebGoogleSignIn,
    getGoogleClientIdsForAuth,
    randomGoogleNonce,
    refreshGoogleAccountState,
    signInWithGoogleWeb,
    signOutGoogleAccount,
    subscribeGoogleAccount,
} from '../platform/googleAccountAuth';

WebBrowser.maybeCompleteAuthSession();

export type SyncUiStatus = 'signed_out' | 'idle' | 'syncing' | 'synced' | 'error';

type GoogleAccountContextValue = {
    configured: boolean;
    session: OwnerSession | null;
    profile: AuthSessionProfile | null;
    platformAiAllowed: boolean;
    busy: boolean;
    signIn: () => Promise<void>;
    signOut: () => Promise<void>;
    refresh: () => Promise<void>;
    syncStatus: SyncUiStatus;
    setSyncStatus: (status: SyncUiStatus) => void;
};

const defaultValue: GoogleAccountContextValue = {
    configured: false,
    session: null,
    profile: null,
    platformAiAllowed: false,
    busy: false,
    signIn: async () => {},
    signOut: async () => {},
    refresh: async () => {},
    syncStatus: 'signed_out',
    setSyncStatus: () => {},
};

const GoogleAccountContext = createContext<GoogleAccountContextValue>(defaultValue);

export function useGoogleAccount(): GoogleAccountContextValue {
    return useContext(GoogleAccountContext);
}

function GoogleAccountProviderInner({ children }: { children: React.ReactNode }) {
    const { webClientId, iosClientId, androidClientId } = getGoogleClientIdsForAuth();
    const [session, setSession] = useState<OwnerSession | null>(null);
    const [profile, setProfile] = useState<AuthSessionProfile | null>(null);
    const [platformAiAllowed, setPlatformAiAllowed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [usePopup, setUsePopup] = useState(false);
    const [syncStatus, setSyncStatus] = useState<SyncUiStatus>('signed_out');

    const googleNonce = useMemo(() => randomGoogleNonce(), []);
    const [request, , promptAsync] = Google.useAuthRequest({
        webClientId: webClientId!,
        iosClientId,
        androidClientId,
        responseType: 'id_token',
        selectAccount: true,
        extraParams: { nonce: googleNonce },
    });

    const applyState = useCallback(async () => {
        const next = await refreshGoogleAccountState();
        setSession(next.session);
        setProfile(next.profile);
        setPlatformAiAllowed(next.platformAiAllowed);
        setSyncStatus(next.session ? 'idle' : 'signed_out');
    }, []);

    const refresh = useCallback(async () => {
        await applyState();
    }, [applyState]);

    useEffect(() => {
        applyState();
        return subscribeGoogleAccount(() => {
            applyState();
        });
    }, [applyState]);

    useEffect(() => {
        consumePendingWebGoogleSignIn();
    }, []);

    const signIn = useCallback(async () => {
        setBusy(true);
        try {
            if (Platform.OS === 'web') {
                if (!webClientId) {
                    throw new Error('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set in this build.');
                }
                const result = await signInWithGoogleWeb(webClientId, usePopup);
                if (result === 'popup-fallback') {
                    setUsePopup(true);
                    return;
                }
            } else {
                if (!request) {
                    Alert.alert('Not ready', 'Google sign-in is still loading. Try again in a moment.');
                    return;
                }
                const result = await promptAsync();
                if (result.type !== 'success') return;
                const idToken = result.params?.id_token;
                if (!idToken) throw new Error('Google did not return an ID token.');
                await completeGoogleSignIn(idToken, googleNonce);
            }
            await applyState();
        } catch (error) {
            if (error instanceof Error && error.message === 'cancelled') return;
            Alert.alert('Sign-in failed', error instanceof Error ? error.message : 'Try again.');
        } finally {
            setBusy(false);
        }
    }, [applyState, googleNonce, promptAsync, request, usePopup, webClientId]);

    const signOut = useCallback(async () => {
        setBusy(true);
        try {
            await signOutGoogleAccount();
            setSession(null);
            setProfile(null);
            setPlatformAiAllowed(false);
            setSyncStatus('signed_out');
        } finally {
            setBusy(false);
        }
    }, []);

    const value = useMemo(
        () => ({
            configured: true,
            session,
            profile,
            platformAiAllowed,
            busy,
            signIn,
            signOut,
            refresh,
            syncStatus,
            setSyncStatus,
        }),
        [session, profile, platformAiAllowed, busy, signIn, signOut, refresh, syncStatus]
    );

    return <GoogleAccountContext.Provider value={value}>{children}</GoogleAccountContext.Provider>;
}

export function GoogleAccountProvider({ children }: { children: React.ReactNode }) {
    if (!isGoogleSignInConfigured()) {
        return <GoogleAccountContext.Provider value={defaultValue}>{children}</GoogleAccountContext.Provider>;
    }
    return <GoogleAccountProviderInner>{children}</GoogleAccountProviderInner>;
}
