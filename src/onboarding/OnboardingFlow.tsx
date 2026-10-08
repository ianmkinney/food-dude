import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { BrandMark } from '../components/Brand';
import SourceLabel from '../components/SourceLabel';
import { AiBadge, AiDisclaimer, AllergyNotice } from '../ai/AiLabel';
import {
    PRIVACY_URL,
    TARGETS,
    TERMS_URL,
    acceptLegal,
    grantConsent,
    setIncludeHealthData,
    type ConsentTarget,
} from '../consent/consentStore';
import { getApiKey, getSelectedProvider } from '../services/aiSettings';
import { generateText, stripCodeFences } from '../services/aiClient';
import { recipeOperations, userOperations } from '../database/operations';
import { findAllergenMatches, parseAllergies } from '../safety/allergens';
import { useSpeechInput } from '../voice/useSpeechInput';
import { LINES, type LineId } from './script';
import { playLine, stopLine } from './onboardingVoice';
import { isVoiceMuted, setVoiceMuted } from './onboardingStore';
import { SAMPLE_RECIPES, type DemoRecipe } from './sampleRecipes';

export type OnboardingResult = { skipped: boolean; savedRecipeId: number | null; savedRecipeTitle: string | null };

type Step = 'intro' | 'agree' | 'allergies' | 'consent' | 'profile' | 'recipes';

const STEP_LINE: Record<Step, LineId> = {
    intro: 'intro',
    agree: 'agree',
    allergies: 'allergies',
    consent: 'consent',
    profile: 'profile',
    recipes: 'recipes',
};

const LIKES = ['Italian', 'Mexican', 'Asian', 'Vegetarian', 'Quick weeknights', 'Spicy', 'Comfort food', 'Healthy', 'Baking'];

async function ensureUser() {
    const existing = await userOperations.getCurrent();
    if (existing) return existing;
    const userId = `user_${Date.now()}`;
    await userOperations.upsert({ userId, name: 'AmpliFood Cook' });
    return userOperations.getByUserId(userId);
}

async function aiDemoRecipes(likes: string): Promise<DemoRecipe[]> {
    const text = await generateText(
        `Suggest 3 different dinner recipes this person might like. Food likes: ${likes || 'not given'}.
Respond with ONLY JSON: {"recipes":[{"title","description","servings","prepTime","cookTime","ingredients":[{"ingredient","quantity","unit"}],"instructions":[string]}]}. Keep each recipe simple (under 10 ingredients).`,
        { feature: 'chat' }
    );
    const parsed = JSON.parse(stripCodeFences(text).slice(stripCodeFences(text).indexOf('{'))) as { recipes?: DemoRecipe[] };
    return (parsed.recipes || []).slice(0, 3).map((r) => ({ ...r, source: 'ai' as const }));
}

export default function OnboardingFlow({ startAt = 'intro', onFinish }: { startAt?: Step; onFinish: (r: OnboardingResult) => void }) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark, undefined, undefined);
    const reduceMotion = useReducedMotion();
    const c = theme.colors;
    const display = { fontFamily: theme.typography.fonts.display };

    const [step, setStep] = useState<Step>(startAt);
    const [skipRest, setSkipRest] = useState(false);
    const [muted, setMuted] = useState(false);
    const [agreed, setAgreed] = useState(false);
    const [showHealthForm, setShowHealthForm] = useState(false);
    const [allergies, setAllergies] = useState('');
    const [diet, setDiet] = useState('');
    const [provider, setProvider] = useState<ConsentTarget>('anthropic');
    const [hasKey, setHasKey] = useState(false);
    const [includeHealth, setIncludeHealth] = useState(false);
    const [aiAllowed, setAiAllowed] = useState(false);
    const [name, setName] = useState('');
    const [likes, setLikes] = useState<string[]>([]);
    const [likesText, setLikesText] = useState('');
    const [recipes, setRecipes] = useState<DemoRecipe[] | null>(null);
    const [hiddenCount, setHiddenCount] = useState(0);
    const [recipeNote, setRecipeNote] = useState<string | null>(null);
    const [saved, setSaved] = useState<{ id: number; title: string } | null>(null);

    const mic = useSpeechInput((said) => setLikesText((prev) => (prev ? `${prev}, ${said}` : said)));

    useEffect(() => {
        isVoiceMuted().then(setMuted);
        getSelectedProvider().then(async (p: string) => {
            setProvider(p as ConsentTarget);
            setHasKey(Boolean(await getApiKey(p)));
        });
        return stopLine;
    }, []);

    useEffect(() => {
        playLine(STEP_LINE[step]);
    }, [step, muted]);

    const toggleMute = async () => {
        const next = !muted;
        setMuted(next);
        await setVoiceMuted(next);
        if (next) stopLine();
    };

    const finish = (skipped: boolean) => {
        stopLine();
        onFinish({ skipped, savedRecipeId: saved?.id ?? null, savedRecipeTitle: saved?.title ?? null });
    };

    const go = (next: Step) => setStep(next);

    const afterAgree = async () => {
        await acceptLegal();
        if (skipRest || startAt === 'agree') finish(true);
        else go('allergies');
    };

    const saveHealth = async () => {
        const user = await ensureUser();
        await userOperations.upsert({
            userId: user.user_id,
            name: user.name,
            username: user.username,
            email: user.email,
            avatarUri: user.avatar_uri,
            recipesCooked: user.recipes_cooked,
            flavorPreferences: user.flavor_preferences,
            allergies: allergies.trim() || null,
            diet: diet.trim() || null,
        });
        go('consent');
    };

    const saveProfile = async () => {
        const user = await ensureUser();
        const likeText = [...likes, likesText.trim()].filter(Boolean).join(', ');
        await userOperations.upsert({
            userId: user.user_id,
            name: name.trim() || user.name,
            username: user.username,
            email: user.email,
            avatarUri: user.avatar_uri,
            recipesCooked: user.recipes_cooked,
            flavorPreferences: likeText || user.flavor_preferences,
        });
        go('recipes');
    };

    useEffect(() => {
        if (step !== 'recipes' || recipes) return;
        const likeText = [...likes, likesText.trim()].filter(Boolean).join(', ');
        const filter = (list: DemoRecipe[]) => {
            const keep = list.filter((r) => !findAllergenMatches(r.ingredients.map((i) => i.ingredient), allergies).length);
            setHiddenCount(list.length - keep.length);
            return keep.slice(0, 3);
        };
        (async () => {
            if (aiAllowed && hasKey) {
                try {
                    setRecipes(filter(await aiDemoRecipes(likeText)));
                    return;
                } catch {
                    setRecipeNote("Couldn't reach your AI provider, so here are sample recipes instead.");
                }
            } else {
                setRecipeNote(
                    hasKey
                        ? "AI is off, so here are sample recipes (not AI). Turn AI on anytime in Account → AI & privacy."
                        : 'No AI key yet, so here are sample recipes (not AI). Add a key anytime in Account.'
                );
            }
            setRecipes(filter(SAMPLE_RECIPES));
        })();
    }, [step]);

    const saveRecipe = async (recipe: DemoRecipe) => {
        const id = Number(
            await recipeOperations.create({
                title: recipe.title,
                description: recipe.description,
                servings: recipe.servings,
                prepTime: recipe.prepTime,
                cookTime: recipe.cookTime,
                totalTime: (recipe.prepTime || 0) + (recipe.cookTime || 0) || null,
                sourcePlatform: recipe.source === 'ai' ? 'Sous' : 'AmpliFood sample',
                ingredients: recipe.ingredients,
                instructions: recipe.instructions,
            })
        );
        await recipeOperations.setProvenance(id, { isAiGenerated: recipe.source === 'ai' });
        setSaved({ id, title: recipe.title });
    };

    const entering = reduceMotion ? undefined : FadeInDown.duration(380);
    const exiting = reduceMotion ? undefined : FadeOut.duration(150);

    const Button = ({ label, onPress, primary, disabled, a11y }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean; a11y?: string }) => (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={a11y || label}
            accessibilityState={{ disabled: !!disabled }}
            style={[styles.button, primary ? { backgroundColor: theme.primary[500] } : { backgroundColor: c.surfaceMuted }, disabled && { opacity: 0.45 }]}
        >
            <Text style={[styles.buttonText, { color: primary ? '#FFFFFF' : c.text.primary }]}>{label}</Text>
        </Pressable>
    );

    const Check = ({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: React.ReactNode; }) => (
        <View style={styles.checkRow}>
            <Switch value={value} onValueChange={onChange} accessibilityLabel={typeof label === 'string' ? label : undefined} />
            <Text style={[styles.body, { color: c.text.primary, flex: 1 }]}>{label}</Text>
        </View>
    );

    const link = (label: string, url: string) => (
        <Text style={[styles.link, { color: theme.primary[700] }]} accessibilityRole="link" onPress={() => Linking.openURL(url)}>
            {label}
        </Text>
    );

    const body = () => {
        switch (step) {
            case 'intro':
                return (
                    <>
                        <Text style={[styles.lead, { color: c.text.primary }]}>
                            <Text style={styles.bold}>Hi, I'm Sous, your AI sous chef.</Text> I'm an AI assistant, not a person. My voice is AI-generated, and AI can make mistakes, so always check ingredients and labels yourself.
                        </Text>
                        <View style={styles.row}>
                            <Button label="Let's go" primary onPress={() => go('agree')} />
                            <Button
                                label="Skip setup"
                                onPress={() => {
                                    setSkipRest(true);
                                    playLine('skipped');
                                    go('agree');
                                }}
                            />
                        </View>
                    </>
                );
            case 'agree':
                return (
                    <>
                        <Text style={[styles.h2, display, { color: c.text.primary }]} accessibilityRole="header">Before we start</Text>
                        <View style={styles.bullets}>
                            <Text style={[styles.body, { color: c.text.secondary }]}>• Sous and its recipe ideas are AI. They can be wrong; nobody reviews them before you see them.</Text>
                            <Text style={[styles.body, { color: c.text.secondary }]}>• Check ingredients and labels for allergens, and cook meat, poultry, eggs and seafood to safe temperatures. Nothing here is medical or dietary advice.</Text>
                            <Text style={[styles.body, { color: c.text.secondary }]}>• Your kitchen stays on this device. We'll ask before anything is sent to an AI provider.</Text>
                        </View>
                        <Check
                            value={agreed}
                            onChange={setAgreed}
                            label={
                                <>
                                    I'm 13 or older (or have a parent's permission if under 18) and I agree to the {link('Terms of Use', TERMS_URL)} and {link('Privacy Policy', PRIVACY_URL)}.
                                </>
                            }
                        />
                        <View style={styles.row}>
                            <Button label="I agree" primary disabled={!agreed} onPress={afterAgree} />
                        </View>
                    </>
                );
            case 'allergies':
                return (
                    <>
                        <Text style={[styles.h2, display, { color: c.text.primary }]} accessibilityRole="header">Allergies & diet (optional)</Text>
                        <View style={styles.bullets}>
                            <Text style={[styles.body, { color: c.text.secondary }]}><Text style={styles.bold}>Why:</Text> only to tailor recipes and flag possible matches.</Text>
                            <Text style={[styles.body, { color: c.text.secondary }]}><Text style={styles.bold}>Where it's kept:</Text> on this device. AmpliFood doesn't receive it.</Text>
                            <Text style={[styles.body, { color: c.text.secondary }]}><Text style={styles.bold}>Who else sees it:</Text> no one, unless you turn on AI and choose to include it.</Text>
                            <Text style={[styles.body, { color: c.text.secondary }]}>Never sold or used for ads. Edit or delete it anytime in Account → Allergies & diet.</Text>
                        </View>
                        <View style={[styles.warn, { borderColor: c.border, backgroundColor: c.surfaceMuted }]}>
                            <Ionicons name="alert-circle-outline" size={18} color={c.text.primary} />
                            <Text style={[styles.body, { color: c.text.primary, flex: 1 }]}>
                                AI can miss hidden allergens. AmpliFood can't promise any recipe is allergen-free, and this isn't medical advice.
                            </Text>
                        </View>
                        {showHealthForm ? (
                            <>
                                <Text style={[styles.label, { color: c.text.secondary }]} nativeID="obAllergies">Allergies</Text>
                                <TextInput value={allergies} onChangeText={setAllergies} placeholder="e.g., peanuts, shellfish" placeholderTextColor={c.text.tertiary} accessibilityLabel="Allergies" accessibilityLabelledBy="obAllergies" style={[styles.input, { color: c.text.primary, borderColor: c.border, backgroundColor: c.surface }]} />
                                <Text style={[styles.label, { color: c.text.secondary }]} nativeID="obDiet">Diet needs</Text>
                                <TextInput value={diet} onChangeText={setDiet} placeholder="e.g., vegetarian, low sodium" placeholderTextColor={c.text.tertiary} accessibilityLabel="Diet needs" accessibilityLabelledBy="obDiet" style={[styles.input, { color: c.text.primary, borderColor: c.border, backgroundColor: c.surface }]} />
                                <View style={styles.row}>
                                    <Button label="Save & continue" primary onPress={saveHealth} />
                                    <Button label="Skip for now" onPress={() => go('consent')} />
                                </View>
                            </>
                        ) : (
                            <View style={styles.row}>
                                <Button label="Add allergies & diet" primary onPress={() => setShowHealthForm(true)} />
                                <Button label="Skip for now" onPress={() => go('consent')} />
                            </View>
                        )}
                    </>
                );
            case 'consent': {
                const info = TARGETS[provider] ?? TARGETS.anthropic;
                return (
                    <>
                        <Text style={[styles.h2, display, { color: c.text.primary }]} accessibilityRole="header">Use AI with {info.name}?</Text>
                        <Text style={[styles.body, { color: c.text.secondary }]}>When you use AI features, AmpliFood sends this to {info.name}, using your own API key:</Text>
                        <View style={styles.bullets}>
                            {['Your messages to Sous (including what you say by voice, sent as text)', 'Photos you attach', 'Your pantry items', 'Your saved recipes', 'Your food likes'].map((line) => (
                                <Text key={line} style={[styles.body, { color: c.text.secondary }]}>• {line}</Text>
                            ))}
                        </View>
                        {link(`${info.name} privacy policy`, info.policy)}
                        <Text style={[styles.body, { color: c.text.secondary }]}>AmpliFood doesn't sell it or use it for ads.</Text>
                        <Check value={includeHealth} onChange={setIncludeHealth} label="Also include my allergies & diet needs" />
                        <Text style={[styles.small, { color: c.text.tertiary }]}>
                            If you leave this off, AmpliFood still checks recipes for your allergens on this device. You can change this anytime in Account → AI & privacy.
                        </Text>
                        {!hasKey && (
                            <Text style={[styles.small, { color: c.text.tertiary }]}>You haven't added an AI key yet. The tour will use sample recipes; add a key later in Account.</Text>
                        )}
                        <View style={styles.row}>
                            <Button
                                label="Allow"
                                primary
                                onPress={async () => {
                                    await grantConsent(provider);
                                    await setIncludeHealthData(includeHealth);
                                    setAiAllowed(true);
                                    go('profile');
                                }}
                            />
                            <Button
                                label="Not now"
                                onPress={async () => {
                                    await setIncludeHealthData(false);
                                    setAiAllowed(false);
                                    go('profile');
                                }}
                            />
                        </View>
                    </>
                );
            }
            case 'profile':
                return (
                    <>
                        <Text style={[styles.h2, display, { color: c.text.primary }]} accessibilityRole="header">What do you like to eat?</Text>
                        <Text style={[styles.label, { color: c.text.secondary }]} nativeID="obName">Your name (optional)</Text>
                        <TextInput value={name} onChangeText={setName} placeholder="e.g., Sam" placeholderTextColor={c.text.tertiary} accessibilityLabel="Your name" accessibilityLabelledBy="obName" style={[styles.input, { color: c.text.primary, borderColor: c.border, backgroundColor: c.surface }]} />
                        <View style={styles.chips}>
                            {LIKES.map((like) => {
                                const on = likes.includes(like);
                                return (
                                    <Pressable
                                        key={like}
                                        onPress={() => setLikes((prev) => (on ? prev.filter((l) => l !== like) : [...prev, like]))}
                                        style={[styles.chip, { borderColor: on ? theme.primary[500] : c.border, backgroundColor: on ? theme.primary[50] : c.surface }]}
                                        accessibilityRole="checkbox"
                                        accessibilityState={{ checked: on }}
                                        accessibilityLabel={like}
                                    >
                                        <Text style={[styles.chipText, { color: on ? theme.primary[700] : c.text.primary }]}>{like}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                        <Text style={[styles.label, { color: c.text.secondary }]} nativeID="obLikes">Anything else?</Text>
                        <View style={styles.micRow}>
                            <TextInput value={mic.state === 'listening' ? mic.transcript : likesText} onChangeText={setLikesText} placeholder="e.g., lemony chicken, no mushrooms" placeholderTextColor={c.text.tertiary} accessibilityLabel="Other food likes" accessibilityLabelledBy="obLikes" style={[styles.input, { flex: 1, color: c.text.primary, borderColor: c.border, backgroundColor: c.surface }]} />
                            <Pressable
                                onPressIn={() => mic.start()}
                                onPressOut={() => mic.stop()}
                                style={[styles.mic, { backgroundColor: mic.state === 'listening' ? c.error : c.surfaceMuted, opacity: mic.isSupported ? 1 : 0.4 }]}
                                accessibilityRole="button"
                                accessibilityLabel="Hold to tell Sous what you like"
                            >
                                <Ionicons name="mic" size={20} color={mic.state === 'listening' ? '#FFFFFF' : c.text.primary} />
                            </Pressable>
                        </View>
                        {!!mic.error && <Text style={[styles.small, { color: c.error }]}>{mic.error}</Text>}
                        <View style={styles.row}>
                            <Button label="Continue" primary onPress={saveProfile} />
                            <Button label="Skip" onPress={() => go('recipes')} />
                        </View>
                    </>
                );
            case 'recipes':
                return (
                    <>
                        <Text style={[styles.h2, display, { color: c.text.primary }]} accessibilityRole="header">A few ideas for you</Text>
                        {!!recipeNote && <Text style={[styles.small, { color: c.text.secondary }]}>{recipeNote}</Text>}
                        {hiddenCount > 0 && (
                            <Text style={[styles.small, { color: c.text.secondary }]}>
                                {hiddenCount} {hiddenCount === 1 ? 'idea was' : 'ideas were'} hidden because the on-device check found a possible match with your allergies.
                            </Text>
                        )}
                        {!recipes ? (
                            <ActivityIndicator color={theme.primary[500]} />
                        ) : (
                            recipes.map((recipe) => (
                                <View key={recipe.title} style={[styles.recipeCard, { backgroundColor: c.surfaceElevated, borderColor: c.border }]}>
                                    <SourceLabel source={recipe.source === 'ai' ? { kind: 'ai' } : { kind: 'sample' }} />
                                    <Text style={[styles.recipeTitle, display, { color: c.text.primary }]}>{recipe.title}</Text>
                                    <Text style={[styles.body, { color: c.text.secondary }]}>{recipe.description}</Text>
                                    <Text style={[styles.small, { color: c.text.tertiary }]}>{recipe.ingredients.map((i) => i.ingredient).join(' · ')}</Text>
                                    {recipe.source === 'ai' && (
                                        <>
                                            <AiDisclaimer kind="recipe" report={{ kind: 'recipe', content: `${recipe.title}\n${recipe.ingredients.map((i) => i.ingredient).join('\n')}` }} />
                                            <AllergyNotice allergies={parseAllergies(allergies)} />
                                        </>
                                    )}
                                    <Button
                                        label={saved?.title === recipe.title ? 'Saved ✓' : 'Save to my recipes'}
                                        primary={!saved}
                                        disabled={!!saved}
                                        a11y={`Save ${recipe.title} to my recipes`}
                                        onPress={() => saveRecipe(recipe)}
                                    />
                                </View>
                            ))
                        )}
                        <View style={styles.row}>
                            <Button label={saved ? 'Show me around' : 'Tour without saving'} primary onPress={() => finish(false)} />
                            <Button label="Skip tour" onPress={() => finish(true)} />
                        </View>
                    </>
                );
        }
    };

    return (
        <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
            <View style={styles.topBar}>
                <BrandMark size={44} style={null} />
                <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                        <Text style={[styles.sous, display, { color: c.text.primary }]}>Sous</Text>
                        <Text style={[styles.small, { color: c.text.tertiary }]}>(Soo)</Text>
                        <AiBadge />
                    </View>
                </View>
                <Pressable onPress={toggleMute} style={[styles.mute, { borderColor: c.border }]} accessibilityRole="switch" accessibilityState={{ checked: !muted }} accessibilityLabel="AI voice">
                    <Ionicons name={muted ? 'volume-mute-outline' : 'volume-high-outline'} size={16} color={c.text.secondary} />
                    <Text style={[styles.muteText, { color: c.text.secondary }]}>{muted ? 'AI voice muted' : 'AI voice'}</Text>
                </Pressable>
            </View>

            <Animated.View key={step} entering={entering} exiting={exiting} style={styles.content}>
                <View style={[styles.caption, { backgroundColor: c.surfaceMuted, borderColor: c.border }]} accessibilityLabel={`Caption: ${LINES[STEP_LINE[step]]}`}>
                    <Text style={[styles.captionTag, { color: c.text.tertiary }]}>CAPTION</Text>
                    <Text style={[styles.captionText, { color: c.text.primary }]}>{LINES[STEP_LINE[step]]}</Text>
                </View>
                {body()}
            </Animated.View>

            {step !== 'agree' && step !== 'intro' && (
                <Pressable onPress={() => finish(true)} style={styles.skipAll} accessibilityRole="button" accessibilityLabel="Skip the rest of setup">
                    <Text style={[styles.skipAllText, { color: c.text.secondary }]}>Skip the rest of setup</Text>
                </Pressable>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    screen: { flexGrow: 1, padding: 22, gap: 18, maxWidth: 560, width: '100%', alignSelf: 'center' },
    topBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    sous: { fontSize: 22 },
    mute: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
    muteText: { fontSize: 12, fontWeight: '700' },
    content: { gap: 14 },
    caption: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 4 },
    captionTag: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    captionText: { fontSize: 15, lineHeight: 22 },
    lead: { fontSize: 18, lineHeight: 27 },
    bold: { fontWeight: '800' },
    h2: { fontSize: 26 },
    body: { fontSize: 15, lineHeight: 22 },
    small: { fontSize: 13, lineHeight: 18 },
    label: { fontSize: 13, fontWeight: '700' },
    link: { fontSize: 15, fontWeight: '800', textDecorationLine: 'underline' },
    bullets: { gap: 6 },
    row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 4 },
    button: { borderRadius: 999, paddingVertical: 13, paddingHorizontal: 22, alignItems: 'center' },
    buttonText: { fontSize: 16, fontWeight: '800' },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    warn: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
    input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
    chipText: { fontSize: 14, fontWeight: '700' },
    micRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    mic: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
    recipeCard: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 8 },
    recipeTitle: { fontSize: 19 },
    skipAll: { alignSelf: 'center', paddingVertical: 8 },
    skipAllText: { fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
});
