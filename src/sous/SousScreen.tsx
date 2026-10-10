import React, { useCallback, useEffect, useRef, useState } from 'react';
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
    useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getTheme, motion } from '../theme';
import { useTheme } from '../context/ThemeContext';
import GuitarMark from '../brand/GuitarMark';
import AnimatedPressable from '../components/AnimatedPressable';
import StrumIndicator from '../components/StrumIndicator';
import WordFade from '../components/WordFade';
import { Enter, useReducedMotion } from '../motion';
import { AiBadge, AiDisclaimer, AllergenWarning, AllergyNotice, ReportButton } from '../ai/AiLabel';
import { useAllergies } from '../safety/useAllergies';
import { findAllergenMatches } from '../safety/allergens';
import { MISSING_KEY_MESSAGE } from '../services/aiSettings';
import { useOnboardingTour } from '../onboarding/useOnboardingTour';
import { ASSISTANT_NAME, ASSISTANT_PRONUNCIATION, ASSISTANT_TAGLINE } from '../config/assistant';
import { useTourTarget } from '../onboarding/tourTargets';
import { getSpeechEngine, primeSpeechOnWeb, shouldSpeak, type SpeechEngine } from '../voice/speech';
import { getVoiceSettings, hasSeenWebSpeechNotice, markWebSpeechNoticeSeen, setAutoSpeak, setVoiceMuted } from '../voice/voiceSettings';
import { useSpeechInput } from '../voice/useSpeechInput';
import { WEB_SPEECH_NOTICE } from '../voice/webSpeechRecognition';
import * as ImagePicker from 'expo-image-picker';
import { recipeOperations } from '../database/operations';
import { importRecipeFromVideoAsset, extractSocialUrlFromText } from '../services/recipeVideoImport';
import { isSocialPostUrl, isTikTokPostUrl, isInstagramPostUrl } from '../services/recipeUrlImport';
import ChatAttachmentPicker from '../components/ChatAttachmentPicker';
import { ATTACHMENT_SOURCE_LABEL } from './attachmentLimits';
import type { PendingAttachment } from './chatAttachments';
import { askSous, confirmSousActions, type SousTurn } from './agent';
import type { SousCard, ToolCall } from './tools';

type Message = {
    id: string;
    role: 'user' | 'sous';
    text: string;
    cards?: SousCard[];
    needsKey?: boolean;
    attachmentNames?: string[];
    confirm?: { actions: ToolCall[]; summary: string; userRecipeImageUri?: string | null };
    confirmDone?: boolean;
};

const SUGGESTIONS = [
    "What can I cook with what's in my pantry?",
    'Import a recipe from a link',
    'Plan dinner for tomorrow',
    'Add eggs, milk and basil to my grocery list',
    'What will my grocery list cost?',
];

let nextId = 0;
const newId = () => `m${Date.now()}-${nextId++}`;

// How long a new message keeps its entrance treatment if the list re-renders mid-animation.
const FRESH_MS = 2000;

// The navigator is untyped JS; this keeps the calls readable without `any`.
type Nav = { navigate: (name: string, params?: object) => void };

export default function SousScreen() {
    const { isDark, textScale } = useTheme();
    const { height: windowHeight } = useWindowDimensions();
    const theme = getTheme(isDark, undefined, undefined);
    const navigation = useNavigation() as unknown as Nav;
    useOnboardingTour();
    const allergies = useAllergies();

    const [messages, setMessages] = useState<Message[]>([]);
    const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
    const [input, setInput] = useState('');
    const [thinking, setThinking] = useState(false);
    const [attachedVideo, setAttachedVideo] = useState<{ uri: string; mimeType?: string; fileName?: string } | null>(null);
    const [autoSpeak, setAutoSpeakState] = useState(false);
    const [speakingId, setSpeakingId] = useState<string | null>(null);
    const engineRef = useRef<SpeechEngine | null>(null);
    const listRef = useRef<FlatList<Message>>(null);
    const reduceMotion = useReducedMotion();
    const freshUntil = useRef(new Map<string, number>());

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
                { id: newId(), role: 'sous', text: (error as Error)?.message || "I couldn't read that aloud." },
            ]);
        } finally {
            setSpeakingId(null);
        }
    }, []);

    const pickVideo = useCallback(async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            setMessages((prev) => [
                ...prev,
                { id: newId(), role: 'sous', text: 'Allow photo library access to attach a screen recording.' },
            ]);
            return;
        }
        const picked = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Videos,
            quality: 1,
        });
        if (picked.canceled || !picked.assets?.[0]) return;
        const asset = picked.assets[0];
        setAttachedVideo({
            uri: asset.uri,
            mimeType: asset.mimeType ?? undefined,
            fileName: asset.fileName ?? undefined,
        });
    }, []);

    const send = useCallback(
        async (raw: string) => {
            const text = raw.trim();
            const attachments = pendingAttachments;
            if ((!text && !attachments.length && !attachedVideo) || thinking) return;
            if (autoSpeak) primeSpeechOnWeb();
            setInput('');
            setPendingAttachments([]);
            const history: SousTurn[] = messages.map((m) => ({ role: m.role, text: m.text }));
            const userMessage: Message = {
                id: newId(),
                role: 'user',
                text: text || (attachedVideo ? '[Screen recording attached]' : '(attached files)'),
                attachmentNames: attachments.map((a) => a.name),
            };
            setMessages((prev) => [...prev, userMessage]);
            setThinking(true);
            const videoAsset = attachedVideo;
            setAttachedVideo(null);
            try {
                if (videoAsset) {
                    const socialUrl =
                        extractSocialUrlFromText(text) || (isSocialPostUrl(text) ? text : null);
                    const imported = await importRecipeFromVideoAsset(videoAsset, {
                        sourceUrl: socialUrl || undefined,
                        sourcePlatform: socialUrl
                            ? isTikTokPostUrl(socialUrl)
                                ? 'tiktok'
                                : isInstagramPostUrl(socialUrl)
                                  ? 'instagram'
                                  : undefined
                            : undefined,
                        note: text,
                    });
                    if (!imported.success || !imported.recipe) {
                        throw new Error(
                            imported.error ||
                                "Couldn't read a recipe from that video. Paste the caption or try a shorter clip."
                        );
                    }
                    const recipe = imported.recipe;
                    const id = Number(await recipeOperations.create(recipe));
                    await recipeOperations.setProvenance(id, { isAiGenerated: true });
                    const card: SousCard = {
                        type: 'recipe',
                        title: 'Imported from video (AI)',
                        recipe: { id, title: recipe.title, is_ai_generated: 1 },
                        aiGenerated: true,
                        ingredients: (recipe.ingredients || []).map((ing: { ingredient?: string }) => ing.ingredient || ''),
                    };
                    const reply: Message = {
                        id: newId(),
                        role: 'sous',
                        text: recipe.sourceUrl
                            ? `I pulled a recipe from your video and credited the creator. Tap the card to review it.`
                            : `I pulled a recipe from your video. Tap the card to review it.`,
                        cards: [card],
                    };
                    setMessages((prev) => [...prev, reply]);
                    return;
                }
                const result = await askSous(history, text || 'Please use the attached files.', attachments);
                const reply: Message = {
                    id: newId(),
                    role: 'sous',
                    text: result.reply,
                    cards: result.cards,
                    confirm: result.pendingActions
                        ? {
                              actions: result.pendingActions,
                              summary: result.confirmSummary || '',
                              userRecipeImageUri: result.userRecipeImageUri,
                          }
                        : undefined,
                };
                setMessages((prev) => [...prev, reply]);
                AccessibilityInfo.announceForAccessibility(`${ASSISTANT_NAME} says: ${result.reply}`);
                if (autoSpeak && (await shouldSpeak()) && !reply.confirm) speak(reply);
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
        [messages, thinking, autoSpeak, speak, attachedVideo, pendingAttachments]
    );

    const confirmActions = useCallback(async (messageId: string) => {
        const target = messages.find((m) => m.id === messageId);
        if (!target?.confirm || target.confirmDone) return;
        setThinking(true);
        try {
            const cards = await confirmSousActions(target.confirm.actions, target.confirm.userRecipeImageUri);
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === messageId ? { ...m, confirmDone: true, cards: [...(m.cards || []), ...cards] } : m
                )
            );
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                { id: newId(), role: 'sous', text: (error as Error)?.message || 'Could not apply those changes.' },
            ]);
        } finally {
            setThinking(false);
        }
    }, [messages]);

    const mic = useSpeechInput((finalText) => send(finalText));
    const micTarget = useTourTarget('sous-composer');
    const listening = mic.state === 'listening';
    const draft = listening ? mic.transcript : input;

    const [micTip, setMicTip] = useState(false);
    const micTipSeen = useRef(true);
    useEffect(() => {
        if (mic.isWeb) hasSeenWebSpeechNotice().then((seen) => (micTipSeen.current = seen));
    }, [mic.isWeb]);
    useEffect(() => {
        if (!micTip) return undefined;
        const t = setTimeout(() => setMicTip(false), 8000);
        return () => clearTimeout(t);
    }, [micTip]);
    const showMicTipOnce = () => {
        if (!mic.isWeb || micTipSeen.current) return;
        micTipSeen.current = true;
        setMicTip(true);
        markWebSpeechNoticeSeen();
    };

    useEffect(() => {
        if (messages.length) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }, [messages.length, thinking]);

    const toggleAutoSpeak = async () => {
        const next = !autoSpeak;
        if (next) primeSpeechOnWeb();
        setAutoSpeakState(next);
        await setAutoSpeak(next);
        if (next) await setVoiceMuted(false);
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
                        {card.sourceLabel ? (
                            <Text style={[styles.cardKicker, { color: c.text.tertiary, textTransform: 'none' }]}>{card.sourceLabel}</Text>
                        ) : null}
                        <View style={styles.cardRow}>
                            <Ionicons name="restaurant-outline" size={20} color={theme.primary[500]} />
                            <Text style={[styles.cardRowText, display, { color: c.text.primary, fontSize: 17 }]} numberOfLines={2}>{card.recipe.title}</Text>
                            <Ionicons name="chevron-forward" size={16} color={c.text.tertiary} />
                        </View>
                        <AllergenWarning matches={findAllergenMatches(card.ingredients || [], allergies.raw)} />
                        {(card.aiGenerated || card.fromUserFile) && (
                            <View style={styles.cardFooter}>
                                {card.aiGenerated ? (
                                    <>
                                        <AiDisclaimer kind="recipe" report={{ kind: 'recipe', content: `${card.recipe.title}\n${(card.ingredients || []).join('\n')}` }} />
                                        <AllergyNotice allergies={allergies.list} />
                                    </>
                                ) : card.fromUserFile ? (
                                    <Text style={[styles.fine, { color: c.text.tertiary }]}>{ATTACHMENT_SOURCE_LABEL}</Text>
                                ) : null}
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
            case 'cost': {
                const sym = card.currency === 'USD' ? '$' : '';
                return (
                    <Pressable key={index} style={cardStyle} onPress={open('EstimateCost')} accessibilityRole="link">
                        <Text style={[styles.cardKicker, { color: c.text.tertiary }]}>Estimated grocery cost{card.store ? ` at ${card.store}` : ''}</Text>
                        <Text style={[styles.cost, display, { color: c.text.primary }]}>
                            {card.total != null ? `${sym}${card.total.toFixed(2)}${card.currency !== 'USD' ? ` ${card.currency}` : ''}` : 'See breakdown'}
                        </Text>
                        {card.lineItems?.slice(0, 6).map((row) => (
                            <Text key={row.name} style={[styles.costLine, { color: c.text.secondary }]} numberOfLines={1}>
                                {row.name}: {sym}{row.estimatedCost.toFixed(2)}
                            </Text>
                        ))}
                        <Text style={[styles.costNote, { color: c.text.tertiary }]}>AI estimate — prices vary by store and region.</Text>
                        <AiDisclaimer kind="estimate" report={{ kind: 'cost', content: `Estimated total ${card.total ?? ''} ${card.currency}` }} />
                    </Pressable>
                );
            }
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

    const isFresh = (id: string) => {
        const now = Date.now();
        let until = freshUntil.current.get(id);
        if (until === undefined) {
            until = now + FRESH_MS;
            freshUntil.current.set(id, until);
        }
        return now < until;
    };

    const renderMessage = ({ item }: { item: Message }) => {
        const fresh = isFresh(item.id);
        if (item.role === 'user') {
            return (
                <Enter enabled={fresh} springy distance={24} style={[styles.bubble, styles.userBubble, { backgroundColor: theme.primary[500] }]}>
                    <Text style={styles.userText}>{item.text}</Text>
                    {item.attachmentNames?.map((name) => (
                        <Text key={name} style={styles.userAttach}>📎 {name}</Text>
                    ))}
                </Enter>
            );
        }
        return (
            <Enter enabled={fresh} springy distance={24} style={styles.sousBlock}>
                <View style={[styles.bubble, styles.sousBubble, { backgroundColor: c.surface, borderColor: c.border }]}>
                    <WordFade text={item.text} animate={fresh && !reduceMotion} style={[styles.sousText, { color: c.text.primary }]} />
                    {item.needsKey && (
                        <Pressable onPress={() => navigation.navigate('Account')} style={[styles.inlineButton, { backgroundColor: theme.primary[500] }]} accessibilityRole="button">
                            <Text style={styles.inlineButtonText}>Open Account</Text>
                        </Pressable>
                    )}
                </View>
                {item.cards?.map(renderCard)}
                {item.confirm && !item.confirmDone && (
                    <View style={[styles.confirmCard, { backgroundColor: c.surface, borderColor: theme.primary[400] }]}>
                        <Text style={[styles.confirmTitle, { color: c.text.primary }]}>Apply in AmpliFood?</Text>
                        <Text style={[styles.confirmBody, { color: c.text.secondary }]}>{item.confirm.summary}</Text>
                        <View style={styles.confirmRow}>
                            <Pressable
                                onPress={() => setMessages((prev) => prev.map((m) => (m.id === item.id ? { ...m, confirmDone: true, confirm: undefined } : m)))}
                                style={[styles.confirmBtn, { backgroundColor: c.surfaceMuted }]}
                                accessibilityRole="button"
                            >
                                <Text style={{ color: c.text.primary, fontWeight: '700' }}>Cancel</Text>
                            </Pressable>
                            <Pressable
                                onPress={() => confirmActions(item.id)}
                                style={[styles.confirmBtn, { backgroundColor: theme.primary[500] }]}
                                accessibilityRole="button"
                            >
                                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Confirm</Text>
                            </Pressable>
                        </View>
                    </View>
                )}
                {!item.needsKey && (
                    <View style={styles.meta}>
                        <AiBadge />
                        <ReportButton target={{ kind: 'chat', content: item.text }} />
                        <Pressable
                            onPress={() => {
                                if (speakingId === item.id) {
                                    engineRef.current?.stop();
                                    return;
                                }
                                primeSpeechOnWeb();
                                speak(item);
                            }}
                            style={styles.metaButton}
                            accessibilityRole="button"
                            accessibilityLabel={speakingId === item.id ? 'Stop reading aloud' : 'Read this reply aloud'}
                        >
                            <Ionicons name={speakingId === item.id ? 'stop-circle-outline' : 'volume-high-outline'} size={18} color={c.text.tertiary} />
                        </Pressable>
                    </View>
                )}
                {!item.needsKey && <AiDisclaimer kind="chat" showBadge={false} style={{ paddingLeft: 4, maxWidth: '92%' }} />}
            </Enter>
        );
    };

    const started = messages.length > 0;

    const hero = (
        <View style={styles.hero}>
            <GuitarMark size={textScale > 1.1 || windowHeight < 760 ? 72 : 112} waves={thinking ? 'thinking' : 'idle'} />
            <Text style={[styles.hello, display, { color: c.text.primary }]} accessibilityRole="header">
                Hi, I&apos;m {ASSISTANT_NAME}
            </Text>
            <Text style={[styles.pronounce, { color: c.text.tertiary }]}>
                {ASSISTANT_PRONUNCIATION} · {ASSISTANT_TAGLINE}
            </Text>
            <Text style={[styles.helloSub, { color: c.text.secondary }]}>
                Ask what to cook. I can find or import recipes, plan meals, and fill your pantry and grocery list.
            </Text>
        </View>
    );

    // Two rows that scroll together, so every suggestion is a tap away without
    // pushing the hero up.
    const chipRows = [SUGGESTIONS.filter((_, i) => i % 2 === 0), SUGGESTIONS.filter((_, i) => i % 2 === 1)];
    const chips = (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.chipScroll}
            contentContainerStyle={styles.chips}
            accessibilityLabel="Suggestions"
        >
            {chipRows.map((row, r) => (
                <View key={r} style={styles.chipRow}>
                    {row.map((s, i) => (
                        <Enter key={s} index={i * 2 + r}>
                            <AnimatedPressable
                                onPress={() => send(s)}
                                scaleTo={motion.scale.press}
                                style={[styles.chip, { borderColor: c.border, backgroundColor: c.surface }]}
                                accessibilityRole="button"
                            >
                                <Text style={[styles.chipText, { color: c.text.primary }]} numberOfLines={1}>{s}</Text>
                            </AnimatedPressable>
                        </Enter>
                    ))}
                </View>
            ))}
        </ScrollView>
    );

    return (
        <KeyboardAvoidingView style={[styles.root, { backgroundColor: c.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
            <View style={styles.iconRow}>
                {started ? (
                    <View style={styles.identity}>
                        <GuitarMark size={32} waves={thinking ? 'thinking' : 'idle'} />
                        <Text style={[styles.identityName, display, { color: c.text.primary }]}>{ASSISTANT_NAME}</Text>
                    </View>
                ) : null}
                <View style={{ flex: 1 }} />
                <AiBadge style={{ alignSelf: 'center' }} />
                <Pressable
                    onPress={() => navigation.navigate('AiChef')}
                    style={styles.iconButton}
                    accessibilityRole="button"
                    accessibilityLabel="Open AI Chef for recipes from your pantry or a photo"
                >
                    <Ionicons name="restaurant-outline" size={20} color={c.text.secondary} />
                </Pressable>
                <Pressable
                    onPress={toggleAutoSpeak}
                    style={[styles.iconButton, autoSpeak && { backgroundColor: theme.primary[500] + '22' }]}
                    accessibilityRole="switch"
                    accessibilityLabel={`Read ${ASSISTANT_NAME} replies aloud`}
                    accessibilityState={{ checked: autoSpeak }}
                    aria-checked={autoSpeak}
                >
                    <Ionicons name={autoSpeak ? 'volume-high' : 'volume-mute-outline'} size={20} color={autoSpeak ? theme.primary[500] : c.text.secondary} />
                </Pressable>
            </View>
            <FlatList
                ref={listRef}
                data={messages}
                keyExtractor={(m) => m.id}
                renderItem={renderMessage}
                ListEmptyComponent={hero}
                contentContainerStyle={[styles.list, !started && styles.listEmpty]}
                keyboardShouldPersistTaps="handled"
                ListFooterComponent={thinking ? (
                    <Enter springy distance={24} style={styles.thinking} accessibilityLiveRegion="polite">
                        <View style={[styles.thinkingBubble, { backgroundColor: c.surface, borderColor: c.border }]}>
                            <StrumIndicator color={theme.primary[500]} />
                        </View>
                        <Text style={[styles.thinkingText, { color: c.text.tertiary }]}>{ASSISTANT_NAME} is on it…</Text>
                    </Enter>
                ) : null}
            />
            {!!voiceNote && !listening && !mic.error && (
                <Text style={[styles.micStatus, { color: c.text.secondary }]}>{voiceNote}</Text>
            )}
            {(mic.error || listening) && (
                <Text style={[styles.micStatus, { color: mic.error ? c.error : theme.primary[600] }]}>
                    {mic.error ||
                        (mic.isWeb
                            ? `Listening… tap the mic again when you're done. ${WEB_SPEECH_NOTICE}`
                            : 'Listening while you hold the mic. Speech is turned into text on this device.')}
                </Text>
            )}
            {!started && chips}
            {attachedVideo ? (
                <View style={[styles.videoAttachBar, { backgroundColor: c.surface, borderColor: c.border }]}>
                    <Ionicons name="videocam" size={18} color={theme.primary[500]} />
                    <Text style={[styles.videoAttachText, { color: c.text.secondary }]} numberOfLines={1}>
                        Screen recording ready — send to extract recipe
                    </Text>
                    <Pressable onPress={() => setAttachedVideo(null)} accessibilityRole="button" accessibilityLabel="Remove video">
                        <Ionicons name="close-circle" size={22} color={c.text.tertiary} />
                    </Pressable>
                </View>
            ) : null}
            <View style={[styles.composerWrap, { borderTopColor: c.borderSoft, backgroundColor: c.background }]}>
                {micTip && (
                    <Enter springy distance={8} style={styles.micTipWrap}>
                        <Pressable
                            onPress={() => setMicTip(false)}
                            style={[styles.micTip, { backgroundColor: c.surfaceElevated, borderColor: c.border }]}
                            accessibilityRole="alert"
                            accessibilityLiveRegion="polite"
                            accessibilityHint="Tap to dismiss"
                        >
                            <Text style={[styles.micTipText, { color: c.text.primary }]}>{WEB_SPEECH_NOTICE}</Text>
                            <View style={[styles.micTipArrow, { backgroundColor: c.surfaceElevated, borderColor: c.border }]} />
                        </Pressable>
                    </Enter>
                )}
                <ChatAttachmentPicker layout="chips" attachments={pendingAttachments} onChange={setPendingAttachments} theme={theme} />
                <View style={styles.composer}>
                <ChatAttachmentPicker layout="button" attachments={pendingAttachments} onChange={setPendingAttachments} theme={theme} />
                <Pressable
                    onPress={pickVideo}
                    style={[styles.roundButton, { backgroundColor: c.surface, borderColor: c.border }]}
                    accessibilityRole="button"
                    accessibilityLabel="Attach screen recording for recipe import"
                >
                    <Ionicons name="film-outline" size={20} color={c.text.primary} />
                </Pressable>
                {mic.isSupported ? (
                    <Pressable
                        ref={micTarget}
                        {...mic.pressProps}
                        onPress={
                            mic.pressProps.onPress
                                ? () => {
                                      if (autoSpeak) primeSpeechOnWeb();
                                      if (!listening) showMicTipOnce();
                                      else setMicTip(false);
                                      mic.pressProps.onPress?.();
                                  }
                                : undefined
                        }
                        style={[styles.roundButton, { backgroundColor: listening ? theme.colors.error : c.surface, borderColor: c.border }]}
                        accessibilityRole="button"
                        accessibilityLabel={mic.isWeb ? `Tap to talk to ${ASSISTANT_NAME}` : `Hold to talk to ${ASSISTANT_NAME}`}
                        accessibilityHint={
                            mic.isWeb
                                ? 'Tap again to stop. Your browser turns speech into text and may send the audio to Apple or Google'
                                : 'Listens only while held. Asks for microphone access the first time'
                        }
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
                    style={[styles.input, { color: c.text.primary, backgroundColor: c.surface, borderColor: c.border }]}
                    multiline
                    numberOfLines={Platform.OS === 'web' ? 1 : undefined}
                    editable={!listening}
                    onSubmitEditing={() => send(input)}
                    blurOnSubmit
                />
                <AnimatedPressable
                    onPress={() => send(listening ? mic.transcript : input)}
                    disabled={(!input.trim() && !pendingAttachments.length && !attachedVideo) || thinking}
                    scaleTo={motion.scale.press}
                    style={[
                        styles.roundButton,
                        styles.sendButton,
                        {
                            backgroundColor: theme.primary[500],
                            opacity: (!input.trim() && !pendingAttachments.length && !attachedVideo) || thinking ? 0.5 : 1,
                        },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Send"
                >
                    <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
                </AnimatedPressable>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    iconRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, minHeight: 52 },
    identity: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4 },
    identityName: { fontSize: 18 },
    iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    list: { paddingHorizontal: 16, paddingVertical: 8, gap: 16 },
    listEmpty: { flexGrow: 1, justifyContent: 'flex-end' },
    hero: { alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8 },
    hello: { fontSize: 30, marginTop: 16, textAlign: 'center' },
    pronounce: { fontSize: 13, marginTop: 4, textAlign: 'center' },
    helloSub: { fontSize: 16, lineHeight: 24, textAlign: 'center', marginTop: 12, maxWidth: 360 },
    chipScroll: { flexGrow: 0, flexShrink: 0 },
    chips: { flexDirection: 'column', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
    chipRow: { flexDirection: 'row', gap: 8 },
    chip: { minHeight: 44, borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, justifyContent: 'center' },
    chipText: { fontSize: 15, fontWeight: '600' },
    bubble: { borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, maxWidth: '88%' },
    userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 8 },
    userText: { color: '#FFFFFF', fontSize: 16, lineHeight: 24 },
    userAttach: { color: '#FFFFFF', fontSize: 13, marginTop: 6, opacity: 0.92 },
    confirmCard: { borderWidth: 1, borderRadius: 16, padding: 14, width: '92%', gap: 8 },
    confirmTitle: { fontSize: 16, fontWeight: '800' },
    confirmBody: { fontSize: 14, lineHeight: 20 },
    confirmRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    confirmBtn: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center' },
    sousBlock: { gap: 8, alignItems: 'flex-start' },
    sousBubble: { borderWidth: 1, borderBottomLeftRadius: 8 },
    sousText: { fontSize: 16, lineHeight: 24 },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4 },
    metaButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
    card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 8, width: '92%' },
    cardTitle: { fontSize: 14, fontWeight: '800' },
    cardKicker: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
    cardRowText: { flex: 1, fontSize: 15 },
    cardFooter: { gap: 8 },
    fine: { fontSize: 12, lineHeight: 16 },
    cost: { fontSize: 28 },
    costLine: { fontSize: 13, marginTop: 4 },
    costNote: { fontSize: 12, marginTop: 8, fontStyle: 'italic' },
    inlineButton: { marginTop: 8, alignSelf: 'flex-start', borderRadius: 22, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' },
    inlineButtonText: { color: '#FFFFFF', fontWeight: '800' },
    thinking: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    thinkingBubble: { borderWidth: 1, borderRadius: 24, borderBottomLeftRadius: 8, paddingHorizontal: 16, paddingVertical: 14 },
    thinkingText: { fontSize: 14 },
    micTipWrap: { position: 'absolute', left: 12, bottom: '100%', marginBottom: 6, zIndex: 2 },
    micTip: { maxWidth: 300, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, ...Platform.select({ web: { boxShadow: '0 6px 20px rgba(0,0,0,0.18)' }, default: {} }) },
    micTipText: { fontSize: 13, lineHeight: 19 },
    micTipArrow: { position: 'absolute', left: 16, bottom: -6, width: 12, height: 12, borderRightWidth: 1, borderBottomWidth: 1, transform: [{ rotate: '45deg' }] },
    micStatus: { textAlign: 'center', fontSize: 13, paddingHorizontal: 16, paddingBottom: 8 },
    videoAttachBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginHorizontal: 12,
        marginBottom: 4,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1,
    },
    videoAttachText: { flex: 1, fontSize: 13 },
    composerWrap: { paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
    composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontSize: 16, lineHeight: 20 },
    roundButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    sendButton: { borderWidth: 0 },
});
