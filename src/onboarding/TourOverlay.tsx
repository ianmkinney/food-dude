import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { AiBadge } from '../ai/AiLabel';
import { groceryOperations, mealPlanOperations, recipeOperations } from '../database/operations';
import { LINES, type LineId } from './script';
import { playLine, stopLine } from './onboardingVoice';
import { isVoiceMuted, setVoiceMuted } from './onboardingStore';
import { measureTarget, type Rect } from './tourTargets';

type Navigate = (route: string) => void;

type TourStep = {
    line: LineId;
    route: string;
    target: string;
    action?: { label: string; done: string; run: () => Promise<void> };
};

const tomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
};

function buildSteps(recipeId: number | null, recipeTitle: string | null): TourStep[] {
    return [
        { line: 'tour_recipes', route: 'Recipes', target: 'tab-Recipes' },
        {
            line: 'tour_plan',
            route: 'Planner',
            target: 'tab-Planner',
            action: recipeId
                ? {
                      label: `Add "${recipeTitle}" to tomorrow's dinner`,
                      done: "Added to tomorrow's dinner.",
                      run: async () => {
                          await mealPlanOperations.add({ recipeId, date: tomorrow(), mealType: 'dinner', servings: 1 });
                      },
                  }
                : undefined,
        },
        {
            line: 'tour_grocery',
            route: 'Grocery',
            target: 'tab-Grocery',
            action: recipeId
                ? {
                      label: 'Add its ingredients to my grocery list',
                      done: 'Ingredients added to your grocery list.',
                      run: async () => {
                          const recipe = await recipeOperations.getById(recipeId);
                          for (const ing of recipe?.ingredients || []) {
                              await groceryOperations.add({
                                  name: ing.ingredient,
                                  quantity: ing.quantity,
                                  unit: ing.unit,
                                  recipeId,
                                  recipeName: recipe.title,
                              });
                          }
                      },
                  }
                : undefined,
        },
        { line: 'tour_pantry', route: 'Pantry', target: 'tab-Pantry' },
        { line: 'tour_sous', route: 'Ampi', target: 'sous-composer' },
    ];
}

export default function TourOverlay({
    navigate,
    recipeId,
    recipeTitle,
    onDone,
}: {
    navigate: Navigate;
    recipeId: number | null;
    recipeTitle: string | null;
    onDone: () => void;
}) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark, undefined, undefined);
    const reduceMotion = useReducedMotion();
    const { width, height } = useWindowDimensions();
    const [steps] = useState(() => buildSteps(recipeId, recipeTitle));
    const [index, setIndex] = useState(0);
    const [rect, setRect] = useState<Rect | null>(null);
    const [actionState, setActionState] = useState<'pending' | 'done' | 'skipped'>('pending');
    const [muted, setMuted] = useState(false);
    const pulse = useSharedValue(0);

    const step = steps[index];
    const awaitingAction = !!step.action && actionState === 'pending';

    const spotlight = useCallback(async (s: TourStep) => {
        navigate(s.route);
        setRect(null);
        // Give the screen a frame to lay out, then find the real element.
        await new Promise((r) => setTimeout(r, 350));
        setRect(await measureTarget(s.target));
    }, [navigate]);

    useEffect(() => {
        isVoiceMuted().then(setMuted);
        return stopLine;
    }, []);

    useEffect(() => {
        setActionState('pending');
        playLine(step.line);
        if (!step.action) spotlight(step);
        else setRect(null);
    }, [index]);

    useEffect(() => {
        if (reduceMotion) return;
        pulse.value = withRepeat(withTiming(1, { duration: 1100 }), -1, true);
    }, [reduceMotion]);

    const ringStyle = useAnimatedStyle(() => ({
        transform: [{ scale: 1 + pulse.value * 0.06 }],
        opacity: 0.95 - pulse.value * 0.35,
    }));

    const runAction = async () => {
        await step.action?.run();
        setActionState('done');
        await spotlight(step);
    };

    const skipAction = async () => {
        setActionState('skipped');
        await spotlight(step);
    };

    const next = () => {
        stopLine();
        if (index + 1 >= steps.length) {
            onDone();
            return;
        }
        setIndex(index + 1);
    };

    const toggleMute = async () => {
        const nextMuted = !muted;
        setMuted(nextMuted);
        await setVoiceMuted(nextMuted);
        if (nextMuted) stopLine();
        else playLine(step.line);
    };

    const c = theme.colors;
    const dim = 'rgba(20, 12, 16, 0.62)';
    const pad = 6;
    const hole = rect ? { x: rect.x - pad, y: rect.y - pad, w: rect.width + pad * 2, h: rect.height + pad * 2 } : null;
    const cardAbove = hole ? hole.y > height / 2 : false;

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none" accessibilityViewIsModal>
            {hole ? (
                <>
                    <View style={[styles.dim, { backgroundColor: dim, left: 0, top: 0, width, height: Math.max(0, hole.y) }]} />
                    <View style={[styles.dim, { backgroundColor: dim, left: 0, top: hole.y + hole.h, width, height: Math.max(0, height - hole.y - hole.h) }]} />
                    <View style={[styles.dim, { backgroundColor: dim, left: 0, top: hole.y, width: Math.max(0, hole.x), height: hole.h }]} />
                    <View style={[styles.dim, { backgroundColor: dim, left: hole.x + hole.w, top: hole.y, width: Math.max(0, width - hole.x - hole.w), height: hole.h }]} />
                    <Animated.View
                        pointerEvents="none"
                        style={[styles.ring, { left: hole.x, top: hole.y, width: hole.w, height: hole.h, borderColor: theme.brand.butter }, !reduceMotion && ringStyle]}
                    />
                </>
            ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: dim }]} />
            )}

            <Animated.View
                key={`${index}-${actionState}`}
                entering={reduceMotion ? undefined : FadeIn.duration(250)}
                style={[
                    styles.card,
                    { backgroundColor: c.surfaceElevated, borderColor: c.border },
                    hole ? (cardAbove ? { bottom: height - hole.y + 16 } : { top: hole.y + hole.h + 16 }) : { top: height * 0.3 },
                ]}
                accessibilityLiveRegion="polite"
            >
                <View style={styles.cardHeader}>
                    <Text style={[styles.sous, { color: c.text.primary, fontFamily: theme.typography.fonts.display }]}>AmpliFood · Ampi</Text>
                    <AiBadge />
                    <View style={{ flex: 1 }} />
                    <Text style={[styles.counter, { color: c.text.tertiary }]}>{index + 1} of {steps.length}</Text>
                    <Pressable onPress={toggleMute} accessibilityRole="switch" accessibilityState={{ checked: !muted }} aria-checked={!muted} accessibilityLabel="AI voice" hitSlop={8} style={styles.voice}>
                        <Ionicons name={muted ? 'volume-mute-outline' : 'volume-high-outline'} size={16} color={c.text.secondary} />
                        <Text style={[styles.voiceText, { color: c.text.secondary }]}>AI voice</Text>
                    </Pressable>
                </View>
                <Text style={[styles.caption, { color: c.text.primary }]} accessibilityLabel={`Caption: ${LINES[step.line]}`}>
                    {LINES[step.line]}
                </Text>
                {step.action && actionState === 'done' && (
                    <Text style={[styles.done, { color: c.success }]}>✓ {step.action.done}</Text>
                )}
                <View style={styles.buttons}>
                    {awaitingAction ? (
                        <>
                            <Pressable onPress={runAction} style={[styles.primary, { backgroundColor: theme.primary[500] }]} accessibilityRole="button">
                                <Text style={styles.primaryText}>{step.action!.label}</Text>
                            </Pressable>
                            <Pressable onPress={skipAction} style={[styles.secondary, { backgroundColor: c.surfaceMuted }]} accessibilityRole="button">
                                <Text style={[styles.secondaryText, { color: c.text.primary }]}>Just show me</Text>
                            </Pressable>
                        </>
                    ) : (
                        <Pressable onPress={next} style={[styles.primary, { backgroundColor: theme.primary[500] }]} accessibilityRole="button">
                            <Text style={styles.primaryText}>{index + 1 >= steps.length ? 'Finish tour' : 'Next'}</Text>
                        </Pressable>
                    )}
                    <Pressable onPress={() => { stopLine(); onDone(); }} style={styles.skip} accessibilityRole="button" accessibilityLabel="Skip tour">
                        <Text style={[styles.skipText, { color: c.text.secondary }]}>Skip tour</Text>
                    </Pressable>
                </View>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    dim: { position: 'absolute' },
    ring: { position: 'absolute', borderWidth: 3, borderRadius: 16 },
    card: { position: 'absolute', left: 16, right: 16, maxWidth: 520, alignSelf: 'center', borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sous: { fontSize: 18 },
    counter: { fontSize: 12, fontWeight: '700' },
    voice: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    voiceText: { fontSize: 12, fontWeight: '700' },
    caption: { fontSize: 16, lineHeight: 23 },
    done: { fontSize: 14, fontWeight: '800' },
    buttons: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
    primary: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11 },
    primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
    secondary: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11 },
    secondaryText: { fontWeight: '800', fontSize: 15 },
    skip: { paddingVertical: 8, paddingHorizontal: 6 },
    skipText: { fontWeight: '700', textDecorationLine: 'underline' },
});
