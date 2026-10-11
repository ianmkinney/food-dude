import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTheme, motion } from '../theme';
import { useTheme } from '../context/ThemeContext';
import GuitarMark from '../brand/GuitarMark';
import AnimatedPressable from '../components/AnimatedPressable';
import { Enter } from '../motion';
import { AiBadge, AiDisclaimer, AllergenWarning, AllergyNotice, reportAiContent } from '../ai/AiLabel';
import MarkdownText from '../chat/MarkdownText';
import TypingBubble from '../chat/TypingBubble';
import { toDisplayText } from '../chat/messageText';
import { formatChatTime, groupPosition } from '../chat/messageGroups';
import { setComposerFocused } from '../chat/composerFocus';
import { useKeyboardViewport } from '../chat/useKeyboardViewport';
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
import {
    importRecipeFromVideoAsset,
    extractSocialUrlFromText,
    extractRecipeImportUrl,
} from '../services/recipeVideoImport';
import { runTools } from './tools';
import { recordChatRecipes } from '../chat/chatRecipes';
import { isSocialPostUrl, isTikTokPostUrl, isInstagramPostUrl } from '../services/recipeUrlImport';
import ChatAttachmentPicker, { type ChatAttachmentPickerHandle } from '../components/ChatAttachmentPicker';
import { ATTACHMENT_SOURCE_LABEL } from './attachmentLimits';
import type { PendingAttachment } from './chatAttachments';
import { persistAmpiExchange } from '../chat/promptContext';
import { recipeEventsFromCards } from '../chat/chatRecipes';
import { CHAT_THREAD_AMPI } from '../chat/chatThreads';
import { chatOperations } from '../database/operations';
import { askSous, confirmSousActions, type SousTurn } from './agent';
import type { SousCard, ToolCall } from './tools';

type Message = {
    id: string;
    role: 'user' | 'sous';
    text: string;
    createdAt: number;
    cards?: SousCard[];
    needsKey?: boolean;
    attachmentNames?: string[];
    confirm?: { actions: ToolCall[]; summary: string; userRecipeImageUri?: string | null };
    confirmDone?: boolean;
    importAssist?: 'instagram_login_wall' | 'instagram_no_caption';
};

const INPUT_LINE_HEIGHT = 20;
const INPUT_MAX_LINES = 6;
const INPUT_MIN_HEIGHT = 40;
const INPUT_MAX_HEIGHT = INPUT_LINE_HEIGHT * INPUT_MAX_LINES + 16;
const INPUT_V_PAD = 8;

function splitImportAssist(cards?: SousCard[]): {
    cards: SousCard[] | undefined;
    importAssist?: Message['importAssist'];
    assistMessage?: string;
} {
    if (!cards?.length) return { cards };
    const assist = cards.find((c) => c.type === 'import_assist');
    if (!assist || assist.type !== 'import_assist') return { cards };
    const rest = cards.filter((c) => c.type !== 'import_assist');
    const code =
        assist.code === 'instagram_login_wall' || assist.code === 'instagram_no_caption' ? assist.code : undefined;
    return {
        cards: rest.length ? rest : undefined,
        importAssist: code,
        assistMessage: assist.message,
    };
}

const SUGGESTIONS = [
    "What can I cook with what's in my pantry?",
    'Import a recipe from a link',
    'Plan dinner for tomorrow',
    'Add eggs, milk and basil to my grocery list',
    'What will my grocery list cost?',
];

let nextId = 0;
const newId = () => `m${Date.now()}-${nextId++}`;
const sousMessage = (text: string, extra: Partial<Message> = {}): Message => ({
    id: newId(),
    role: 'sous',
    text,
    createdAt: Date.now(),
    ...extra,
});

// How long a new message keeps its entrance treatment if the list re-renders mid-animation.
const FRESH_MS = 2000;

// The navigator is untyped JS; this keeps the calls readable without `any`.
type Nav = { navigate: (name: string, params?: object) => void };

export default function SousScreen() {
    const { isDark, textScale } = useTheme();
    const { height: windowHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();
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
    const inputRef = useRef<TextInput>(null);
    const attachRef = useRef<ChatAttachmentPickerHandle>(null);
    const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);
    const freshUntil = useRef(new Map<string, number>());

    const [composerFocused, setComposerFocusedState] = useState(false);
    const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onComposerFocus = useCallback(() => {
        if (blurTimer.current) clearTimeout(blurTimer.current);
        setComposerFocusedState(true);
        setComposerFocused(true);
    }, []);
    // Tapping send briefly blurs the field before it's refocused; waiting a
    // beat keeps the tab bar from flashing back in between.
    const onComposerBlur = useCallback(() => {
        if (blurTimer.current) clearTimeout(blurTimer.current);
        blurTimer.current = setTimeout(() => {
            setComposerFocusedState(false);
            setComposerFocused(false);
        }, 150);
    }, []);
    useEffect(
        () => () => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
            setComposerFocused(false);
        },
        []
    );
    // Like Messages, the conversation stays pinned to the newest message when
    // the list resizes (keyboard, tab bar) unless the user scrolled up to read.
    const atBottom = useRef(true);
    const scrollToLatest = useCallback(() => {
        if (atBottom.current) listRef.current?.scrollToEnd({ animated: false });
    }, []);
    const c = theme.colors;
    const { keyboardOpen } = useKeyboardViewport(composerFocused, scrollToLatest, {
        pageBackground: c.background,
    });

    useEffect(() => {
        getVoiceSettings().then((s) => setAutoSpeakState(s.autoSpeak));
        chatOperations.getRecent(CHAT_THREAD_AMPI, 40).then((rows) => {
            if (!rows.length) return;
            rows.forEach((row: { id: number }) => freshUntil.current.set(String(row.id), 0));
            setMessages(
                rows.map((row: { id: number; role: string; text: string; created_at?: number }) => ({
                    id: String(row.id),
                    role: row.role === 'user' ? 'user' : 'sous',
                    text: row.text,
                    createdAt: Number(row.created_at) || Date.now(),
                }))
            );
        });
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
        setVoiceNote(null);
        try {
            engineRef.current = await getSpeechEngine();
            await engineRef.current.speak(message.text, { onIssue: setVoiceNote });
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                sousMessage((error as Error)?.message || "I couldn't read that aloud."),
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
                sousMessage('Allow photo library access to attach a screen recording.'),
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
            if (composerFocused) inputRef.current?.focus();
            setInput('');
            setInputHeight(INPUT_MIN_HEIGHT);
            setPendingAttachments([]);
            const history: SousTurn[] = messages.map((m) => ({ role: m.role, text: m.text }));
            const userMessage: Message = {
                id: newId(),
                role: 'user',
                text: text || (attachedVideo ? '[Screen recording attached]' : '(attached files)'),
                createdAt: Date.now(),
                attachmentNames: attachments.map((a) => a.name),
            };
            setMessages((prev) => [...prev, userMessage]);
            setThinking(true);
            const videoAsset = attachedVideo;
            setAttachedVideo(null);
            try {
                const linkImportUrl =
                    !attachments.length && !videoAsset ? extractRecipeImportUrl(text) : null;
                if (linkImportUrl) {
                    const rawCards = await runTools([{ tool: 'import_recipe', args: { url: linkImportUrl } }]);
                    const split = splitImportAssist(rawCards);
                    const reply: Message = {
                        id: newId(),
                        role: 'sous',
                        createdAt: Date.now(),
                        text:
                            split.assistMessage ||
                            (rawCards[0]?.type === 'recipe'
                                ? 'Imported — tap the card to review.'
                                : rawCards[0]?.type === 'error'
                                  ? rawCards[0].message
                                  : 'Done.'),
                        cards: split.cards,
                        importAssist: split.importAssist,
                    };
                    setMessages((prev) => [...prev, reply]);
                    await persistAmpiExchange(userMessage.text, reply.text, {
                        recipes: recipeEventsFromCards(split.cards || rawCards),
                    });
                    if (autoSpeak && (await shouldSpeak()) && reply.text) speak(reply);
                    return;
                }
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
                        savedAs: 'imported',
                    };
                    const reply: Message = {
                        id: newId(),
                        role: 'sous',
                        createdAt: Date.now(),
                        text: recipe.sourceUrl
                            ? `I pulled a recipe from your video and credited the creator. Tap the card to review it.`
                            : `I pulled a recipe from your video. Tap the card to review it.`,
                        cards: [card],
                    };
                    setMessages((prev) => [...prev, reply]);
                    await persistAmpiExchange(userMessage.text, reply.text, {
                        recipes: recipeEventsFromCards([card]),
                    });
                    return;
                }
                const result = await askSous(history, text || 'Please use the attached files.', attachments);
                const split = splitImportAssist(result.cards);
                const reply: Message = {
                    id: newId(),
                    role: 'sous',
                    createdAt: Date.now(),
                    text: split.assistMessage || result.reply,
                    cards: split.cards,
                    importAssist: split.importAssist,
                    confirm: result.pendingActions
                        ? {
                              actions: result.pendingActions,
                              summary: result.confirmSummary || '',
                              userRecipeImageUri: result.userRecipeImageUri,
                          }
                        : undefined,
                };
                setMessages((prev) => [...prev, reply]);
                await persistAmpiExchange(userMessage.text, result.reply);
                AccessibilityInfo.announceForAccessibility(`${ASSISTANT_NAME} says: ${toDisplayText(result.reply)}`);
                if (autoSpeak && (await shouldSpeak()) && !reply.confirm) speak(reply);
            } catch (error) {
                const message = (error as Error)?.message || 'Something went wrong.';
                setMessages((prev) => [
                    ...prev,
                    {
                        id: newId(),
                        role: 'sous',
                        createdAt: Date.now(),
                        text: message === MISSING_KEY_MESSAGE ? "I need an AI key to think. Add your own key in Account and I'm ready." : message,
                        needsKey: message === MISSING_KEY_MESSAGE,
                    },
                ]);
            } finally {
                setThinking(false);
            }
        },
        [messages, thinking, autoSpeak, speak, attachedVideo, pendingAttachments, composerFocused]
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
                sousMessage((error as Error)?.message || 'Could not apply those changes.'),
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
                                {card.type === 'grocery' && card.action === 'removed'
                                    ? `Cleared from grocery list: ${card.items.join(', ')}`
                                    : `Added to ${card.type === 'pantry' ? 'pantry' : 'grocery list'}: ${card.items.join(', ')}`}
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
            case 'import_assist':
                return null;
            case 'error':
                return (
                    <View key={index} style={[...cardStyle, { borderColor: c.error }]}>
                        <Text style={{ color: c.error }}>{card.message}</Text>
                    </View>
                );
            case 'notice':
                return (
                    <View key={index} style={[...cardStyle, { borderColor: c.border }]}>
                        <Text style={{ color: c.text.secondary }}>{card.message}</Text>
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

    const renderMessage = ({ item, index }: { item: Message; index: number }) => {
        const fresh = isFresh(item.id);
        const { first, last, showTime } = groupPosition(messages, index);
        const spacing = { marginTop: index === 0 ? 0 : first ? 12 : 2 };
        const time = showTime ? (
            <Text style={[styles.timestamp, { color: c.text.tertiary }]} accessibilityRole="text">
                {formatChatTime(item.createdAt)}
            </Text>
        ) : null;
        if (item.role === 'user') {
            return (
                <View style={spacing}>
                    {time}
                    <Enter
                        enabled={fresh}
                        springy
                        distance={16}
                        style={[
                            styles.bubble,
                            styles.userBubble,
                            !first && styles.userJoinedTop,
                            !last && styles.userJoinedBottom,
                            { backgroundColor: theme.primary[500] },
                        ]}
                    >
                        <Text style={styles.userText} selectable>
                            {item.text}
                        </Text>
                        {item.attachmentNames?.map((name) => (
                            <Text key={name} style={styles.userAttach}>📎 {name}</Text>
                        ))}
                    </Enter>
                </View>
            );
        }
        const shown = toDisplayText(item.text);
        const speaking = speakingId === item.id;
        return (
            <View style={spacing}>
                {time}
                <Enter enabled={fresh} springy distance={16} style={styles.sousBlock}>
                    <View
                        style={[
                            styles.bubble,
                            styles.sousBubble,
                            !first && styles.sousJoinedTop,
                            !last && styles.sousJoinedBottom,
                            { backgroundColor: c.surface, borderColor: c.border },
                        ]}
                    >
                        <MarkdownText
                            text={shown}
                            color={c.text.primary}
                            mutedColor={c.text.secondary}
                            linkColor={theme.primary[600]}
                            codeBackground={c.surfaceMuted}
                            style={styles.sousText}
                        />
                        {item.needsKey && (
                            <Pressable onPress={() => navigation.navigate('Account')} style={[styles.inlineButton, { backgroundColor: theme.primary[500] }]} accessibilityRole="button">
                                <Text style={styles.inlineButtonText}>Open Account</Text>
                            </Pressable>
                        )}
                        {item.importAssist && (
                            <View style={styles.importAssistRow}>
                                <Pressable
                                    onPress={() => inputRef.current?.focus()}
                                    style={[styles.importAssistBtn, { borderColor: c.border, backgroundColor: c.surfaceMuted }]}
                                    accessibilityRole="button"
                                >
                                    <Text style={[styles.importAssistBtnText, { color: c.text.primary }]}>Paste caption</Text>
                                </Pressable>
                                <Pressable
                                    onPress={pickVideo}
                                    style={[styles.importAssistBtn, { borderColor: c.border, backgroundColor: c.surfaceMuted }]}
                                    accessibilityRole="button"
                                >
                                    <Text style={[styles.importAssistBtnText, { color: c.text.primary }]}>Upload screen recording</Text>
                                </Pressable>
                                <Pressable
                                    onPress={() => attachRef.current?.openPicker()}
                                    style={[styles.importAssistBtn, { borderColor: c.border, backgroundColor: c.surfaceMuted }]}
                                    accessibilityRole="button"
                                >
                                    <Text style={[styles.importAssistBtnText, { color: c.text.primary }]}>Upload screenshot</Text>
                                </Pressable>
                            </View>
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
                        <View style={styles.footer}>
                            <View style={styles.footerItem} accessible accessibilityRole="text" accessibilityLabel="AI-generated">
                                <Ionicons name="sparkles" size={10} color={c.text.tertiary} />
                                <Text style={[styles.footerText, { color: c.text.tertiary }]}>AI-generated</Text>
                            </View>
                            <Text style={[styles.footerText, { color: c.text.tertiary }]} aria-hidden>·</Text>
                            <Pressable
                                onPress={() => reportAiContent({ kind: 'chat', content: shown })}
                                hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
                                accessibilityRole="button"
                                accessibilityLabel="Report this AI response"
                            >
                                <Text style={[styles.footerText, styles.footerLink, { color: c.text.tertiary }]}>Report</Text>
                            </Pressable>
                            <Text style={[styles.footerText, { color: c.text.tertiary }]} aria-hidden>·</Text>
                            <Pressable
                                onPress={() => {
                                    if (speaking) {
                                        engineRef.current?.stop();
                                        return;
                                    }
                                    primeSpeechOnWeb();
                                    speak(item);
                                }}
                                hitSlop={{ top: 12, bottom: 12, left: 10, right: 14 }}
                                style={styles.footerItem}
                                accessibilityRole="button"
                                accessibilityLabel={speaking ? 'Stop reading aloud' : 'Read this reply aloud'}
                            >
                                <Ionicons name={speaking ? 'stop-circle-outline' : 'volume-high-outline'} size={14} color={speaking ? theme.primary[500] : c.text.tertiary} />
                                <Text style={[styles.footerText, { color: speaking ? theme.primary[500] : c.text.tertiary }]}>{speaking ? 'Stop' : 'Listen'}</Text>
                            </Pressable>
                        </View>
                    )}
                </Enter>
            </View>
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
                extraData={speakingId}
                ListEmptyComponent={hero}
                ListHeaderComponent={
                    started ? (
                        <View style={styles.disclaimerHeader}>
                            <AiDisclaimer kind="chat" showBadge={false} style={styles.disclaimerInner} />
                        </View>
                    ) : null
                }
                contentContainerStyle={[styles.list, !started && styles.listEmpty]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                onLayout={scrollToLatest}
                onContentSizeChange={scrollToLatest}
                onScroll={(e) => {
                    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                    atBottom.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 48;
                }}
                scrollEventThrottle={64}
                ListFooterComponent={thinking ? (
                    <Enter springy distance={16} style={styles.thinking}>
                        <TypingBubble
                            background={c.surface}
                            border={c.border}
                            dot={c.text.tertiary}
                            label={`${ASSISTANT_NAME} is typing`}
                        />
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
            <View
                style={[
                    styles.composerWrap,
                    {
                        borderTopColor: c.borderSoft,
                        backgroundColor: c.background,
                        // The tab bar normally covers the home indicator; while it's hidden for
                        // typing (and no keyboard is up, e.g. a hardware keyboard) the composer must.
                        paddingBottom:
                            Platform.OS === 'web' && composerFocused
                                ? keyboardOpen
                                    ? 4
                                    : Math.max(insets.bottom, 8)
                                : composerFocused && !keyboardOpen
                                  ? Math.max(insets.bottom, 8)
                                  : 8,
                    },
                ]}
            >
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
                <View style={styles.composerInputRow}>
                    <TextInput
                        ref={inputRef}
                        value={draft}
                        onChangeText={(text) => {
                            setInput(text);
                            if (!text.trim()) setInputHeight(INPUT_MIN_HEIGHT);
                        }}
                        onFocus={onComposerFocus}
                        onBlur={onComposerBlur}
                        placeholder={`Message ${ASSISTANT_NAME}…`}
                        accessibilityLabel={`Message to ${ASSISTANT_NAME}`}
                        placeholderTextColor={c.text.tertiary}
                        style={[
                            styles.input,
                            {
                                color: c.text.primary,
                                backgroundColor: c.surface,
                                borderColor: c.border,
                                ...(Platform.OS === 'web' && !draft.trim()
                                    ? { minHeight: INPUT_MIN_HEIGHT, maxHeight: INPUT_MAX_HEIGHT }
                                    : { height: Math.max(INPUT_MIN_HEIGHT, inputHeight) }),
                            },
                        ]}
                        multiline
                        scrollEnabled={inputHeight >= INPUT_MAX_HEIGHT}
                        onContentSizeChange={(e) => {
                            if (Platform.OS === 'web' && !draft.trim()) {
                                setInputHeight(INPUT_MIN_HEIGHT);
                                return;
                            }
                            const measured = e.nativeEvent.contentSize.height + INPUT_V_PAD * 2;
                            const next = Math.min(INPUT_MAX_HEIGHT, Math.max(INPUT_MIN_HEIGHT, measured));
                            setInputHeight(next);
                        }}
                        editable={!listening}
                        onSubmitEditing={() => send(input)}
                        // On the web Enter sends without dropping the keyboard (Shift+Enter is a new line).
                        blurOnSubmit={Platform.OS !== 'web'}
                        onKeyPress={
                            Platform.OS === 'web'
                                ? (e) => {
                                      const key = e.nativeEvent as unknown as { key: string; shiftKey?: boolean; isComposing?: boolean };
                                      if (key.key === 'Enter' && !key.shiftKey && !key.isComposing) {
                                          e.preventDefault();
                                          send(input);
                                      }
                                  }
                                : undefined
                        }
                    />
                    <View {...keepComposerFocus}>
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
                <View style={styles.composerToolsRow}>
                    <ChatAttachmentPicker
                        ref={attachRef}
                        layout="button"
                        attachments={pendingAttachments}
                        onChange={setPendingAttachments}
                        theme={theme}
                    />
                    <Pressable
                        onPress={pickVideo}
                        style={[styles.toolButton, { backgroundColor: c.surface, borderColor: c.border }]}
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
                            style={[
                                styles.toolButton,
                                { backgroundColor: listening ? theme.colors.error : c.surface, borderColor: c.border },
                            ]}
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
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

// On the web a mousedown on the send button would move focus off the
// textarea and close the phone keyboard between messages.
const keepComposerFocus =
    Platform.OS === 'web' ? ({ onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault() } as object) : {};

const styles = StyleSheet.create({
    root: { flex: 1 },
    iconRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, minHeight: 52 },
    identity: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4 },
    identityName: { fontSize: 18 },
    iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    list: { paddingHorizontal: 12, paddingVertical: 8 },
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
    bubble: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, maxWidth: '84%' },
    userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
    userJoinedTop: { borderTopRightRadius: 6 },
    userJoinedBottom: { borderBottomRightRadius: 6 },
    userText: { color: '#FFFFFF', fontSize: 16, lineHeight: 22 },
    timestamp: { alignSelf: 'center', fontSize: 11, fontWeight: '600', marginTop: 6, marginBottom: 8, letterSpacing: 0.2 },
    disclaimerHeader: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10 },
    disclaimerInner: { maxWidth: 340, alignItems: 'center' },
    userAttach: { color: '#FFFFFF', fontSize: 13, marginTop: 6, opacity: 0.92 },
    confirmCard: { borderWidth: 1, borderRadius: 16, padding: 14, width: '92%', gap: 8 },
    confirmTitle: { fontSize: 16, fontWeight: '800' },
    confirmBody: { fontSize: 14, lineHeight: 20 },
    confirmRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    confirmBtn: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center' },
    sousBlock: { gap: 4, alignItems: 'flex-start' },
    sousBubble: { borderWidth: 1, borderBottomLeftRadius: 6 },
    sousJoinedTop: { borderTopLeftRadius: 6 },
    sousJoinedBottom: { borderBottomLeftRadius: 6 },
    sousText: { fontSize: 16, lineHeight: 22 },
    footer: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 6, minHeight: 20 },
    footerItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    footerText: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
    footerLink: { textDecorationLine: 'underline' },
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
    thinking: { marginTop: 12, alignItems: 'flex-start' },
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
    composerInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, width: '100%' },
    composerToolsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, paddingLeft: 2 },
    input: {
        flex: 1,
        minHeight: INPUT_MIN_HEIGHT,
        maxHeight: INPUT_MAX_HEIGHT,
        borderWidth: 1,
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingTop: INPUT_V_PAD,
        paddingBottom: INPUT_V_PAD,
        fontSize: 16,
        lineHeight: INPUT_LINE_HEIGHT,
    },
    toolButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    importAssistRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    importAssistBtn: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, minHeight: 40, justifyContent: 'center' },
    importAssistBtnText: { fontSize: 13, fontWeight: '700' },
    roundButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    sendButton: { borderWidth: 0 },
});
