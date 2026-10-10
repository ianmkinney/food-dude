import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
    AccessibilityInfo,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import GuitarMark from '../components/GuitarMark';
import AnimatedPressable from '../components/AnimatedPressable';
import { HeaderAccountActions, HeaderIconButton } from '../components/HeaderTitle';
import { Breathe, Rise, StrumDots, springUp, useReducedMotion } from '../motion';
import { AiBadge, AiDisclaimer, AllergenWarning, AllergyNotice, ReportButton } from '../ai/AiLabel';
import { useAllergies } from '../safety/useAllergies';
import { findAllergenMatches } from '../safety/allergens';
import { MISSING_KEY_MESSAGE } from '../services/aiSettings';
import { useOnboardingTour } from '../onboarding/useOnboardingTour';
import { ASSISTANT_NAME, ASSISTANT_PRONUNCIATION, ASSISTANT_TAGLINE } from '../config/assistant';
import { useTourTarget } from '../onboarding/tourTargets';
import { getSpeechEngine, shouldSpeak, type SpeechEngine } from '../voice/speech';
import { getVoiceSettings, setAutoSpeak, setVoiceMuted } from '../voice/voiceSettings';
import { useSpeechInput } from '../voice/useSpeechInput';
import { askSous, type SousTurn } from './agent';
import type { SousCard } from './tools';

type Message = { id: string; role: 'user' | 'sous'; text: string; cards?: SousCard[]; needsKey?: boolean; at: number };

type Suggestion = { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; prompt?: string; screen?: string };

const SUGGESTIONS: Suggestion[] = [
    { label: 'Cook from my pantry', icon: 'cube-outline', prompt: "What can I cook with what's in my pantry?" },
    { label: 'Plan dinner tomorrow', icon: 'calendar-outline', prompt: 'Plan dinner for tomorrow' },
    { label: 'Import a recipe', icon: 'link-outline', prompt: 'Import a recipe from a link' },
    { label: 'Add to grocery list', icon: 'cart-outline', prompt: 'Add eggs, milk and basil to my grocery list' },
    { label: 'Price my groceries', icon: 'calculator-outline', prompt: 'What will my grocery list cost?' },
    { label: 'Cook from a photo', icon: 'camera-outline', screen: 'AiChef' },
];

// Word-by-word fade for a fresh reply. Web only: native can't animate nested
// Text runs, so it gets the bubble's spring instead.
const FRESH_MS = 1500;
const wordFade = { from: { opacity: 0 }, to: { opacity: 1 } };

function FadeWords({ text, style, animate }: { text: string; style: object[]; animate: boolean }) {
    if (!animate || Platform.OS !== 'web') return <Text style={style}>{text}</Text>;
    const parts = text.split(/(\s+)/);
    const words = Math.ceil(parts.length / 2);
    if (words > 160) return <Text style={style}>{text}</Text>;
    const step = Math.min(24, 700 / Math.max(words, 1));
    return (
        <Text style={style}>
            {parts.map((part, i) =>
                /^\s+$/.test(part) ? (
                    part
                ) : (
                    <Animated.Text
                        key={i}
                        style={
                            {
                                animationName: wordFade,
                                animationDuration: 180,
                                animationDelay: Math.round((i / 2) * step),
                                animationFillMode: 'backwards',
                                animationTimingFunction: 'ease-out',
                            } as object
                        }
                    >
                        {part}
                    </Animated.Text>
                )
            )}
        </Text>
    );
}

let nextId = 0;
const newId = () => `m${Date.now()}-${nextId++}`;

// The navigator is untyped JS; this keeps the calls readable without `any`.
type Nav = { navigate: (name: string, params?: object) => void };

export default function SousScreen() {
    const { isDark } = useTheme();
    const theme = getTheme(isDark, undefined, undefined);
    const navigation = useNavigation() as unknown as Nav & { setOptions: (options: object) => void };
    const reduce = useReducedMotion();
    useOnboardingTour();
    const allergies = useAllergies();

    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [thinking, setThinking] = useState(false);
    const [autoSpeak, setAutoSpeakState] = useState(false);
    const [speakingId, setSpeakingId] = useState<string | null>(null);
    const engineRef = useRef<SpeechEngine | null>(null);
    const listRef = useRef<FlatList<Message>>(null);

    useEffect(() => {
        getVoiceSettings().then((s) => setAutoSpeakState(s.autoSpeak));
        return () => engineRef.current?.stop();
    }, []);

    const [voiceNote, setVoiceNote] = useState<string | null>(null);

    const speak = useCallback(async (message: Message) => {
        engineRef.current?.stop();
        if (!(await shouldSpeak())) {
            setVoiceNote(`Voice is muted or a screen reader is on, so replies are text only. Change this in Account → ${ASSISTANT_NAME} voice.`);
            return;
        }
        setSpeakingId(message.id);
        try {
            engineRef.current = await getSpeechEngine();
            await engineRef.current.speak(message.text);
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                { id: newId(), role: 'sous', text: (error as Error)?.message || "I couldn't read that aloud.", at: Date.now() },
            ]);
        } finally {
            setSpeakingId(null);
        }
    }, []);

    const send = useCallback(
        async (raw: string) => {
            const text = raw.trim();
            if (!text || thinking) return;
            setInput('');
            const history: SousTurn[] = messages.map((m) => ({ role: m.role, text: m.text }));
            const userMessage: Message = { id: newId(), role: 'user', text, at: Date.now() };
            setMessages((prev) => [...prev, userMessage]);
            setThinking(true);
            try {
                const result = await askSous(history, text);
                const reply: Message = { id: newId(), role: 'sous', text: result.reply, cards: result.cards, at: Date.now() };
                setMessages((prev) => [...prev, reply]);
                AccessibilityInfo.announceForAccessibility(`${ASSISTANT_NAME} says: ${result.reply}`);
                if (autoSpeak && (await shouldSpeak())) speak(reply);
            } catch (error) {
                const message = (error as Error)?.message || 'Something went wrong.';
                setMessages((prev) => [
                    ...prev,
                    {
                        id: newId(),
                        role: 'sous',
                        text: message === MISSING_KEY_MESSAGE ? "I need an AI key to think. Add your own key in Account and I'm ready." : message,
                        needsKey: message === MISSING_KEY_MESSAGE,
                        at: Date.now(),
                    },
                ]);
            } finally {
                setThinking(false);
            }
        },
        [messages, thinking, autoSpeak, speak]
    );

    const mic = useSpeechInput((finalText) => send(finalText));
    const micTarget = useTourTarget('sous-composer');
    const listening = mic.state === 'listening';
    const draft = listening ? mic.transcript : input;

    useEffect(() => {
        if (messages.length) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }, [messages.length, thinking]);

    const toggleAutoSpeak = useCallback(async () => {
        const next = !autoSpeak;
        setAutoSpeakState(next);
        await setAutoSpeak(next);
        if (next) await setVoiceMuted(false);
        if (!next) engineRef.current?.stop();
    }, [autoSpeak]);

    useLayoutEffect(() => {
        navigation.setOptions({
            headerRight: (props: { tintColor?: string }) => (
                <HeaderAccountActions
                    {...props}
                    leading={
                        <HeaderIconButton
                            icon={autoSpeak ? 'volume-high' : 'volume-mute-outline'}
                            label={`Read ${ASSISTANT_NAME} replies aloud`}
                            role="switch"
                            checked={autoSpeak}
                            onPress={toggleAutoSpeak}
                            color={autoSpeak ? theme.primary[500] : props.tintColor || theme.colors.text.primary}
                        />
                    }
                />
            ),
        });
    }, [navigation, autoSpeak, toggleAutoSpeak, theme.primary, theme.colors.text.primary]);

    const c = theme.colors;
    const display = { fontFamily: theme.typography.fonts.display };

    const renderCard = (card: SousCard, index: number) => {
        const cardStyle = [styles.card, { backgroundColor: c.surface, borderColor: c.border }];
        const open = (name: string, params?: object) => () => navigation.navigate(name, params);
        switch (card.type) {
            case 'recipes':
                return (
                    <View key={index} style={cardStyle}>
                        <Text style={[styles.cardTitle, { color: c.text.primary }]}>{card.title}</Text>
                        {card.recipes.map((r) => (
                            <Pressable key={r.id} onPress={open('RecipeDetail', { recipeId: r.id })} style={styles.cardRow} accessibilityRole="link">
                                <Ionicons name="book-outline" size={18} color={theme.primary[500]} />
                                <Text style={[styles.cardRowText, { color: c.text.primary }]} numberOfLines={1}>{r.title}</Text>
                                {r.is_ai_generated ? <AiBadge /> : null}
                                <Ionicons name="chevron-forward" size={16} color={c.text.tertiary} />
                            </Pressable>
                        ))}
                    </View>
                );
            case 'recipe':
                return (
                    <Pressable key={index} style={cardStyle} onPress={open('RecipeDetail', { recipeId: card.recipe.id })} accessibilityRole="link">
                        <Text style={[styles.cardKicker, { color: c.text.tertiary }]}>{card.title}</Text>
                        <View style={styles.cardRow}>
                            <Ionicons name="restaurant-outline" size={20} color={theme.primary[500]} />
                            <Text style={[styles.cardRowText, display, { color: c.text.primary, fontSize: 17 }]} numberOfLines={2}>{card.recipe.title}</Text>
                            <Ionicons name="chevron-forward" size={16} color={c.text.tertiary} />
                        </View>
                        <AllergenWarning matches={findAllergenMatches(card.ingredients || [], allergies.raw)} />
                        {card.aiGenerated && (
                            <View style={styles.cardFooter}>
                                <AiDisclaimer kind="recipe" report={{ kind: 'recipe', content: `${card.recipe.title}\n${(card.ingredients || []).join('\n')}` }} />
                                <AllergyNotice allergies={allergies.list} />
                            </View>
                        )}
                    </Pressable>
                );
            case 'meal_plan':
                return (
                    <Pressable key={index} style={cardStyle} onPress={open('Planner')} accessibilityRole="link">
                        <View style={styles.cardRow}>
                            <Ionicons name="calendar-outline" size={20} color={theme.primary[500]} />
                            <Text style={[styles.cardRowText, { color: c.text.primary }]}>
                                {card.recipeTitle} · {card.mealType} on {card.date}
                            </Text>
                            <Ionicons name="chevron-forward" size={16} color={c.text.tertiary} />
                        </View>
                    </Pressable>
                );
            case 'pantry':
            case 'grocery':
                return (
                    <Pressable key={index} style={cardStyle} onPress={open(card.type === 'pantry' ? 'Pantry' : 'Grocery')} accessibilityRole="link">
                        <View style={styles.cardRow}>
                            <Ionicons name={card.type === 'pantry' ? 'cube-outline' : 'cart-outline'} size={20} color={theme.primary[500]} />
                            <Text style={[styles.cardRowText, { color: c.text.primary }]} numberOfLines={2}>
                                Added to {card.type === 'pantry' ? 'pantry' : 'grocery list'}: {card.items.join(', ')}
                            </Text>
                            <Ionicons name="chevron-forward" size={16} color={c.text.tertiary} />
                        </View>
                    </Pressable>
                );
            case 'cost':
                return (
                    <Pressable key={index} style={cardStyle} onPress={open('EstimateCost')} accessibilityRole="link">
                        <Text style={[styles.cardKicker, { color: c.text.tertiary }]}>Estimated grocery cost{card.store ? ` at ${card.store}` : ''}</Text>
                        <Text style={[styles.cost, display, { color: c.text.primary }]}>
                            {card.total != null ? `${card.currency === 'USD' ? '$' : ''}${card.total.toFixed(2)}${card.currency !== 'USD' ? ` ${card.currency}` : ''}` : 'See breakdown'}
                        </Text>
                        <AiDisclaimer kind="estimate" report={{ kind: 'cost', content: `Estimated total ${card.total ?? ''} ${card.currency}` }} />
                    </Pressable>
                );
            case 'error':
                return (
                    <View key={index} style={[...cardStyle, { borderColor: c.error }]}>
                        <Text style={{ color: c.error }}>{card.message}</Text>
                    </View>
                );
            default:
                return null;
        }
    };

    const renderMessage = ({ item }: { item: Message }) => {
        const fresh = Date.now() - item.at < FRESH_MS;
        const entering = fresh ? springUp(reduce) : undefined;
        if (item.role === 'user') {
            return (
                <Animated.View entering={entering} style={[styles.bubble, styles.userBubble, { backgroundColor: theme.primary[500] }]}>
                    <Text style={styles.userText}>{item.text}</Text>
                </Animated.View>
            );
        }
        return (
            <Animated.View entering={entering} style={styles.sousBlock}>
                <View style={[styles.bubble, styles.sousBubble, { backgroundColor: c.surfaceElevated, borderColor: c.border }]}>
                    <FadeWords text={item.text} style={[styles.sousText, { color: c.text.primary }]} animate={fresh && !reduce} />
                    {item.needsKey && (
                        <Pressable onPress={() => navigation.navigate('Account')} style={[styles.inlineButton, { backgroundColor: theme.primary[500] }]}>
                            <Text style={styles.inlineButtonText}>Open Account</Text>
                        </Pressable>
                    )}
                </View>
                {item.cards?.map(renderCard)}
                {!item.needsKey && (
                    <View style={styles.meta}>
                        <AiBadge />
                        <ReportButton target={{ kind: 'chat', content: item.text }} />
                        <Pressable
                            onPress={() => (speakingId === item.id ? engineRef.current?.stop() : speak(item))}
                            accessibilityRole="button"
                            accessibilityLabel={speakingId === item.id ? 'Stop reading aloud' : 'Read this reply aloud'}
                            hitSlop={8}
                        >
                            <Ionicons name={speakingId === item.id ? 'stop-circle-outline' : 'volume-high-outline'} size={18} color={c.text.tertiary} />
                        </Pressable>
                    </View>
                )}
                {!item.needsKey && <AiDisclaimer kind="chat" showBadge={false} style={{ paddingLeft: 4, maxWidth: '92%' }} />}
            </Animated.View>
        );
    };

    const empty = (
        <View style={styles.empty}>
            <Breathe thinking={thinking}>
                <GuitarMark size={88} />
            </Breathe>
            <Rise index={1}>
                <Text style={[styles.hello, display, { color: c.text.primary }]} accessibilityRole="header">
                    Hi, I'm {ASSISTANT_NAME}
                </Text>
            </Rise>
            <Rise index={2} style={styles.subRow}>
                <Text style={[styles.pronounce, { color: c.text.tertiary }]}>
                    {ASSISTANT_PRONUNCIATION} · {ASSISTANT_TAGLINE}
                </Text>
                <AiBadge />
            </Rise>
            <Rise index={3}>
                <Text style={[styles.helloSub, { color: c.text.secondary }]}>
                    Ask what to cook. I can find recipes, plan meals and fill your lists.
                </Text>
            </Rise>
        </View>
    );

    const pickSuggestion = (s: Suggestion) => {
        if (s.screen) navigation.navigate(s.screen);
        else if (s.prompt) send(s.prompt);
    };

    return (
        <KeyboardAvoidingView style={[styles.root, { backgroundColor: c.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
            <FlatList
                ref={listRef}
                data={messages}
                keyExtractor={(m) => m.id}
                renderItem={renderMessage}
                ListEmptyComponent={empty}
                contentContainerStyle={[styles.list, !messages.length && styles.listEmpty]}
                ListFooterComponent={thinking ? (
                    <Animated.View entering={springUp(reduce)} style={styles.thinking} accessibilityLiveRegion="polite">
                        <Breathe thinking>
                            <GuitarMark size={32} waves="none" />
                        </Breathe>
                        <View style={[styles.thinkingBubble, { backgroundColor: c.surfaceElevated, borderColor: c.border }]}>
                            <StrumDots color={theme.primary[500]} />
                        </View>
                        <Text style={[styles.thinkingText, { color: c.text.tertiary }]}>{ASSISTANT_NAME} is on it…</Text>
                    </Animated.View>
                ) : null}
            />
            {!!voiceNote && !listening && !mic.error && (
                <Text style={[styles.micStatus, { color: c.text.secondary }]}>{voiceNote}</Text>
            )}
            {(mic.error || listening) && (
                <Text style={[styles.micStatus, { color: mic.error ? c.error : theme.primary[600] }]}>
                    {mic.error || 'Listening while you hold the mic. Speech is turned into text on this device.'}
                </Text>
            )}
            {!messages.length && !thinking && (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.chipScroller}
                    contentContainerStyle={styles.chips}
                    accessibilityLabel="Suggestions"
                >
                    {SUGGESTIONS.map((sug, i) => (
                        <Rise key={sug.label} index={i + 2}>
                            <AnimatedPressable
                                onPress={() => pickSuggestion(sug)}
                                scaleTo={0.96}
                                style={[styles.chip, { borderColor: c.border, backgroundColor: c.surfaceElevated }]}
                                accessibilityRole="button"
                                accessibilityLabel={sug.prompt || sug.label}
                            >
                                <Ionicons name={sug.icon} size={16} color={theme.primary[500]} />
                                <Text style={[styles.chipText, { color: c.text.primary }]}>{sug.label}</Text>
                            </AnimatedPressable>
                        </Rise>
                    ))}
                </ScrollView>
            )}
            <View style={[styles.composer, { borderTopColor: c.borderSoft, backgroundColor: c.background }]}>
                {mic.isSupported ? (
                    <Pressable
                        ref={micTarget}
                        onPressIn={() => mic.start()}
                        onPressOut={() => mic.stop()}
                        style={[styles.roundButton, { backgroundColor: listening ? theme.colors.error : c.surfaceMuted }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Hold to talk to ${ASSISTANT_NAME}`}
                        accessibilityHint="Listens only while held. Asks for microphone access the first time"
                    >
                        <Ionicons name={listening ? 'stop' : 'mic'} size={20} color={listening ? '#FFFFFF' : c.text.primary} />
                    </Pressable>
                ) : null}
                <TextInput
                    value={draft}
                    onChangeText={setInput}
                    placeholder={`Message ${ASSISTANT_NAME}…`}
                    accessibilityLabel={`Message to ${ASSISTANT_NAME}`}
                    placeholderTextColor={c.text.tertiary}
                    style={[styles.input, { color: c.text.primary, backgroundColor: c.surfaceElevated, borderColor: c.border }]}
                    multiline
                    editable={!listening}
                    onSubmitEditing={() => send(input)}
                    blurOnSubmit
                />
                <AnimatedPressable
                    onPress={() => send(input)}
                    disabled={!input.trim() || thinking}
                    scaleTo={0.9}
                    style={[styles.roundButton, { backgroundColor: theme.primary[500], opacity: !input.trim() || thinking ? 0.5 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Send"
                >
                    <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
                </AnimatedPressable>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    list: { padding: 16, gap: 16, width: '100%', alignSelf: 'center' },
    listEmpty: { flexGrow: 1, justifyContent: 'center' },
    empty: { alignItems: 'center', paddingHorizontal: 24, gap: 8 },
    hello: { fontSize: 32, lineHeight: 38, marginTop: 8, textAlign: 'center' },
    subRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
    pronounce: { fontSize: 12, lineHeight: 16 },
    helloSub: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 8, maxWidth: 320 },
    chipScroller: { flexGrow: 0 },
    chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8, paddingTop: 4, justifyContent: 'flex-start' },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16 },
    chipText: { fontSize: 14, fontWeight: '600' },
    bubble: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, maxWidth: '88%' },
    userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
    userText: { color: '#FFFFFF', fontSize: 16, lineHeight: 22 },
    sousBlock: { gap: 8, alignItems: 'flex-start' },
    sousBubble: { borderWidth: 1, borderBottomLeftRadius: 4 },
    sousText: { fontSize: 16, lineHeight: 24 },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingLeft: 4, minHeight: 32 },
    card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 8, width: '92%' },
    cardTitle: { fontSize: 14, fontWeight: '800' },
    cardKicker: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
    cardRowText: { flex: 1, fontSize: 15 },
    cardFooter: { gap: 8 },
    cost: { fontSize: 28 },
    inlineButton: { marginTop: 8, alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' },
    inlineButtonText: { color: '#FFFFFF', fontWeight: '800' },
    thinking: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4 },
    thinkingBubble: { borderWidth: 1, borderRadius: 16, borderBottomLeftRadius: 4, paddingHorizontal: 16, paddingVertical: 8 },
    thinkingText: { fontSize: 13 },
    micStatus: { textAlign: 'center', fontSize: 13, paddingHorizontal: 16, paddingBottom: 8 },
    composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1 },
    input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontSize: 16 },
    roundButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
