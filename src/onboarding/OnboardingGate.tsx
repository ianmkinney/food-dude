import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { LEGAL_VERSION, getLegalAcceptance } from '../consent/consentStore';
import OnboardingFlow, { type OnboardingResult } from './OnboardingFlow';
import TourOverlay from './TourOverlay';
import { isOnboardingDone, markOnboardingDone, onReplayRequested } from './onboardingStore';

type Mode = { kind: 'loading' } | { kind: 'flow'; startAt: 'intro' | 'agree' } | { kind: 'app'; tour: OnboardingResult | null };

/**
 * First run: AI disclosure → 13+ agreement → allergies & diet (optional) →
 * AI consent → profile → demo recipes → tour over the real app. Returning users
 * whose accepted Terms version is out of date see only the agreement step.
 */
export default function OnboardingGate({ children, navigate }: { children: React.ReactNode; navigate: (route: string) => void }) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark, undefined, undefined);
    const [mode, setMode] = useState<Mode>({ kind: 'loading' });

    const decide = useCallback(async () => {
        const [done, legal] = await Promise.all([isOnboardingDone(), getLegalAcceptance()]);
        if (!done) setMode({ kind: 'flow', startAt: 'intro' });
        else if (legal?.version !== LEGAL_VERSION) setMode({ kind: 'flow', startAt: 'agree' });
        else setMode({ kind: 'app', tour: null });
    }, []);

    useEffect(() => {
        decide();
        return onReplayRequested(() => setMode({ kind: 'flow', startAt: 'intro' }));
    }, [decide]);

    const finish = async (result: OnboardingResult) => {
        await markOnboardingDone();
        setMode({ kind: 'app', tour: result.skipped ? null : result });
    };

    if (mode.kind === 'loading') return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
    if (mode.kind === 'flow') return <OnboardingFlow startAt={mode.startAt} onFinish={finish} />;

    return (
        <View style={{ flex: 1 }}>
            {children}
            {mode.tour && (
                <TourOverlay
                    navigate={navigate}
                    recipeId={mode.tour.savedRecipeId}
                    recipeTitle={mode.tour.savedRecipeTitle}
                    onDone={() => setMode({ kind: 'app', tour: null })}
                />
            )}
        </View>
    );
}
