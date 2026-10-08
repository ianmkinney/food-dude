import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    AccessibilityInfo,
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { BrandMark } from '../components/Brand';
import { AiBadge, AiDisclaimer, AllergenWarning, AllergyNotice, ReportButton } from '../ai/AiLabel';
import { useAllergies } from '../safety/useAllergies';
import { findAllergenMatches } from '../safety/allergens';
import { MISSING_KEY_MESSAGE } from '../services/aiSettings';
import { useOnboardingTour } from '../onboarding/useOnboardingTour';
import { getSpeechEngine, shouldSpeak, type SpeechEngine } from '../voice/speech';
import { getVoiceSettings, setAutoSpeak } from '../voice/voiceSettings';
import { useSpeechInput } from '../voice/useSpeechInput';
import { askSous, type SousTurn } from './agent';
import type { SousCard } from './tools';

type Message = { id: string; role: 'user' | 'sous'; text: string; cards?: SousCard[]; needsKey?: boolean };

const SUGGESTIONS = [
    "What can I cook with what's in my pantry?",
    'Import a recipe from a link',
    'Plan dinner for tomorrow',
    'Add eggs, milk and basil to my grocery list',
    'What will my grocery list cost?',
];

let nextId = 0;
const newId = () => `m${Date.now()}-${nextId++}`;

// The navigator is untyped JS; this keeps the calls readable without `any`.
type Nav = { navigate: (name: string, params?: object) => void };

export default function SousScreen() {
    const { isDark } = useTheme();
    const theme = getTheme(isDark, undefined, undefined);
    const navigation = useNavigation() as unknown as Nav;
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
            setVoiceNote('Voice is muted or a screen reader is on, so replies are text only. Change this in Account → Sous voice.');
            return;
        }
        setSpeakingId(message.id);
        try {
            engineRef.current = await getSpeechEngine(setVoiceNote);
            await engineRef.current.speak(message.text);
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                { id: newId(), role: 'sous', text: (error as Error)?.message || "I couldn't read that aloud." },
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
            const userMessage: Message = { id: newId(), role: 'user', text };
            setMessages((prev) => [...prev, userMessage]);
            setThinking(true);
            try {
                const result = await askSous(history, text);
                const reply: Message = { id: newId(), role: 'sous', text: result.reply, cards: result.cards };
                setMessages((prev) => [...prev, reply]);
                AccessibilityInfo.announceForAccessibility(`Sous says: ${result.reply}`);
                if (autoSpeak) speak(reply);
            } catch (error) {
                const message = (error as Error)?.message || 'Something went wrong.';
                setMessages((prev) => [
                    ...prev,
                    {
                        id: newId(),
                        role: 'sous',
                        text: message === MISSING_KEY_MESSAGE ? "I need an AI key to think. Add your own key in Account and I'm ready." : message,
                        needsKey: message === MISSING_KEY_MESSAGE,
                    },
                ]);
            } finally {
                setThinking(false);
            }
        },
        [messages, thinking, autoSpeak, speak]
    );

    const mic = useSpeechInput((finalText) => send(finalText));
    const listening = mic.state === 'listening';
    const draft = listening ? mic.transcript : input;

    useEffect(() => {
        if (messages.length) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }, [messages.length, thinking]);

    const toggleAutoSpeak = async () => {
        const next = !autoSpeak;
        setAutoSpeakState(next);
        await setAutoSpeak(next);
        if (!next) engineRef.current?.stop();
    };

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
        if (item.role === 'user') {
            return (
                <View style={[styles.bubble, styles.userBubble, { backgroundColor: theme.primary[500] }]}>
                    <Text style={styles.userText}>{item.text}</Text>
                </View>
            );
        }
        return (
            <View style={styles.sousBlock}>
                <View style={[styles.bubble, styles.sousBubble, { backgroundColor: c.surfaceElevated, borderColor: c.border }]}>
                    <Text style={[styles.sousText, { color: c.text.primary }]}>{item.text}</Text>
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
            </View>
        );
    };

    const empty = (
        <View style={styles.empty}>
            <BrandMark size={110} style={null} />
            <Text style={[styles.hello, display, { color: c.text.primary }]}>Hey, I'm Sous.</Text>
            <Text style={[styles.pronounce, { color: c.text.tertiary }]}>Sous (Soo) · your AI sous chef</Text>
            <Text style={[styles.helloSub, { color: c.text.secondary }]}>
                Ask me what to cook, and I can find or import recipes, plan meals, and fill your pantry and grocery list.
            </Text>
            <View style={styles.chips}>
                {SUGGESTIONS.map((s) => (
                    <Pressable key={s} onPress={() => send(s)} style={[styles.chip, { borderColor: c.border, backgroundColor: c.surface }]}>
                        <Text style={[styles.chipText, { color: c.text.primary }]}>{s}</Text>
                    </Pressable>
                ))}
            </View>
        </View>
    );

    return (
        <KeyboardAvoidingView style={[styles.root, { backgroundColor: c.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
            <View style={styles.topBar}>
                <Text style={[styles.topTitle, display, { color: c.text.primary }]}>Sous</Text>
                <Text style={[styles.pronounceInline, { color: c.text.tertiary }]}>(Soo)</Text>
                <View style={{ flex: 1 }} />
                <Pressable onPress={toggleAutoSpeak} style={[styles.toggle, { borderColor: c.border }]} accessibilityRole="switch" accessibilityLabel="Read Sous replies aloud" accessibilityState={{ checked: autoSpeak }}>
                    <Ionicons name={autoSpeak ? 'volume-high' : 'volume-mute-outline'} size={16} color={autoSpeak ? theme.primary[500] : c.text.tertiary} />
                    <Text style={[styles.toggleText, { color: c.text.secondary }]}>{autoSpeak ? 'Voice on' : 'Voice off'}</Text>
                </Pressable>
            </View>
            <FlatList
                ref={listRef}
                data={messages}
                keyExtractor={(m) => m.id}
                renderItem={renderMessage}
                ListEmptyComponent={empty}
                contentContainerStyle={[styles.list, !messages.length && { flexGrow: 1, justifyContent: 'center' }]}
                ListFooterComponent={thinking ? (
                    <View style={styles.thinking} accessibilityLiveRegion="polite">
                        <ActivityIndicator size="small" color={theme.primary[500]} />
                        <Text style={{ color: c.text.tertiary }}>Sous is on it…</Text>
                    </View>
                ) : null}
            />
            {!!voiceNote && !listening && !mic.error && (
                <Text style={[styles.micStatus, { color: c.text.secondary }]}>{voiceNote}</Text>
            )}
            {(mic.error || listening) && (
                <Text style={[styles.micStatus, { color: mic.error ? c.error : theme.primary[600] }]}>
                    {mic.error || 'Listening… tap the mic again to stop.'}
                </Text>
            )}
            <View style={[styles.composer, { borderTopColor: c.borderSoft, backgroundColor: c.surfaceGlass }]}>
                <Pressable
                    onPress={() => (listening ? mic.stop() : mic.start())}
                    style={[styles.roundButton, { backgroundColor: listening ? theme.colors.error : c.surfaceMuted, opacity: mic.isSupported ? 1 : 0.4 }]}
                    accessibilityRole="button"
                    accessibilityLabel={listening ? 'Stop talking' : 'Talk to Sous'}
                    accessibilityHint="Asks for microphone access the first time"
                >
                    <Ionicons name={listening ? 'stop' : 'mic'} size={20} color={listening ? '#FFFFFF' : c.text.primary} />
                </Pressable>
                <TextInput
                    value={draft}
                    onChangeText={setInput}
                    placeholder="Message Sous…"
                    accessibilityLabel="Message to Sous"
                    placeholderTextColor={c.text.tertiary}
                    style={[styles.input, { color: c.text.primary, backgroundColor: c.surface, borderColor: c.border }]}
                    multiline
                    editable={!listening}
                    onSubmitEditing={() => send(input)}
                    blurOnSubmit
                />
                <Pressable
                    onPress={() => send(input)}
                    disabled={!input.trim() || thinking}
                    style={[styles.roundButton, { backgroundColor: theme.primary[500], opacity: !input.trim() || thinking ? 0.5 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Send"
                >
                    <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    topBar: { flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 4 },
    topTitle: { fontSize: 24 },
    pronounceInline: { fontSize: 13 },
    toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'center' },
    toggleText: { fontSize: 12, fontWeight: '700' },
    list: { padding: 16, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' },
    empty: { alignItems: 'center', paddingHorizontal: 12 },
    hello: { fontSize: 30, marginTop: 12 },
    pronounce: { fontSize: 13, marginTop: 2 },
    helloSub: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10, maxWidth: 420 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 18 },
    chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
    chipText: { fontSize: 14, fontWeight: '600' },
    bubble: { borderRadius: 20, paddingHorizontal: 15, paddingVertical: 11, maxWidth: '88%' },
    userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
    userText: { color: '#FFFFFF', fontSize: 16, lineHeight: 22 },
    sousBlock: { gap: 8, alignItems: 'flex-start' },
    sousBubble: { borderWidth: 1, borderBottomLeftRadius: 6 },
    sousText: { fontSize: 16, lineHeight: 23 },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 4 },
    fine: { fontSize: 11.5, lineHeight: 16, paddingLeft: 4, maxWidth: '92%' },
    card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8, width: '92%' },
    cardTitle: { fontSize: 14, fontWeight: '800' },
    cardKicker: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    cardRowText: { flex: 1, fontSize: 15 },
    cardFooter: { gap: 6 },
    cost: { fontSize: 28 },
    inlineButton: { marginTop: 10, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
    inlineButtonText: { color: '#FFFFFF', fontWeight: '800' },
    thinking: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4 },
    micStatus: { textAlign: 'center', fontSize: 13, paddingHorizontal: 16, paddingBottom: 6 },
    composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1 },
    input: { flex: 1, minHeight: 42, maxHeight: 120, borderWidth: 1, borderRadius: 21, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 16 },
    roundButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
