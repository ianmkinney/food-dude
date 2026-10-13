import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { AiBadge } from '../../ai/AiLabel';
import AnimatedPressable from '../AnimatedPressable';
import { formatChatTime, groupPosition } from '../../chat/messageGroups';
import { useKeyboardViewport } from '../../chat/useKeyboardViewport';
import { setComposerFocused as setGlobalComposerFocused } from '../../chat/composerFocus';
import { ASSISTANT_NAME } from '../../config/assistant';
import { motion } from '../../theme';
import {
    deletePartyChatMessage,
    mergePartyChatMessages,
    postPartyChatMessage,
} from '../../services/partyLiveSync';
import { toDisplayText } from '../../chat/messageText';
import { visiblePartyAmpiContent } from '../../../api/_lib/partyAmpiReply.js';
import {
    executePartyChatCommand,
    finalizePartyAmpiReplyForPost,
    messageMentionsAmpi,
    PARTY_AMPI_EMPTY_REPLY,
    PARTY_AMPI_PANTRY_PREFILL,
    runPartyAmpiReply,
} from '../../services/partyAmpiChat';
import { PartyAmpiMessageExtras } from './PartyAmpiMessageExtras';
import { PartyPantryShareToggle } from './PartyPantryShareToggle';
import {
    getPantrySharePromptSeen,
    isPartyPantryMealPrompt,
    pushPartyPantrySnapshot,
    setPantrySharePromptSeen,
    setPartyPantryShare,
} from '../../services/partyPantryShare';
import { savePartyChatAttachmentLocal, loadPartyChatAttachmentLocal } from '../../party/partyChatLocalFiles';
import { usePartyChatHistory } from '../../hooks/usePartyChatHistory';

const MENTION_RE = /@ampi\b/i;

function newPendingMessageId() {
    const uuid = globalThis.crypto?.randomUUID?.();
    return `pending-${uuid || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}
const INPUT_LINE_HEIGHT = 20;
const INPUT_MAX_LINES = 6;
const INPUT_MIN_HEIGHT = 40;
const INPUT_MAX_HEIGHT = INPUT_LINE_HEIGHT * INPUT_MAX_LINES + 16;
const INPUT_V_PAD = 8;

function avatarColor(name, theme) {
    const palette = [theme.primary[500], theme.colors.error, '#4F802F', '#8B5CF6'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = (h + name.charCodeAt(i)) % palette.length;
    return palette[h];
}

function PartyChatBubble({
    message,
    theme,
    position,
    isOwn,
    onDelete,
    canDelete,
    onRetry,
    onRetryAmpi,
    onAddRecipeToPartyMeal,
    onMealsChanged,
    livePartyId: bubbleLivePartyId,
    defaultLiveMealId,
}) {
    const c = theme.colors;
    const isAmpi = message.isAmpi;
    const failed = message.sendState === 'failed';
    const pending = message.sendState === 'pending';
    const visible = isAmpi ? visiblePartyAmpiContent(message) : null;
    const bodyText = isAmpi ? toDisplayText(visible.text || '') : message.body;
    const ampiFailed = Boolean(isAmpi && message.attachment?.ampi?.failed);
    const extrasMessage =
        isAmpi && visible
            ? {
                  ...message,
                  attachment: {
                      ...(message.attachment || {}),
                      ampi: {
                          ...(message.attachment?.ampi || {}),
                          cards: visible.cards,
                      },
                  },
              }
            : message;
    if (isAmpi && !bodyText && !visible?.cards?.length && !ampiFailed) {
        return null;
    }
    const joinedTop = !position.first;
    const joinedBottom = !position.last;
    const time = position.showTime ? (
        <Text style={[styles.timestamp, { color: c.text.tertiary }]}>{formatChatTime(message.createdAt)}</Text>
    ) : null;

    if (isOwn && !isAmpi) {
        return (
            <View style={{ marginBottom: position.last ? 10 : 2 }}>
                {time}
                {!position.first ? null : (
                    <Text style={[styles.sender, { color: c.text.secondary, alignSelf: 'flex-end' }]}>You</Text>
                )}
                <View
                    style={[
                        styles.bubble,
                        styles.userBubble,
                        joinedTop && styles.userJoinedTop,
                        joinedBottom && styles.userJoinedBottom,
                        {
                            backgroundColor: theme.primary[500],
                            alignSelf: 'flex-end',
                            opacity: pending ? 0.65 : failed ? 0.85 : 1,
                        },
                    ]}
                >
                    {message.body ? (
                        <Text style={styles.userText} selectable>
                            {message.body}
                        </Text>
                    ) : null}
                    {message.attachment?.fileName ? (
                        <Text style={styles.userAttach}>📎 {message.attachment.fileName}</Text>
                    ) : null}
                </View>
                {failed ? (
                    <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry send">
                        <Text style={{ color: c.error, fontSize: 12, marginTop: 4, textAlign: 'right', fontWeight: '600' }}>
                            Failed to send — tap to retry
                        </Text>
                    </Pressable>
                ) : null}
                {canDelete && !pending ? (
                    <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel="Delete message">
                        <Text style={{ color: c.error, fontSize: 12, marginTop: 2, textAlign: 'right' }}>Delete</Text>
                    </Pressable>
                ) : null}
            </View>
        );
    }

    return (
        <View style={{ marginBottom: position.last ? 10 : 2 }}>
            {time}
            {position.first ? (
                <Text style={[styles.sender, { color: c.text.secondary }]}>
                    {isAmpi ? ASSISTANT_NAME : message.senderDisplayName}
                </Text>
            ) : null}
            <View
                style={[
                    styles.bubble,
                    styles.sousBubble,
                    joinedTop && styles.sousJoinedTop,
                    joinedBottom && styles.sousJoinedBottom,
                    {
                        backgroundColor: c.surface,
                        borderColor: c.border,
                        alignSelf: 'flex-start',
                    },
                ]}
            >
                {isAmpi ? <AiBadge style={{ marginBottom: 4 }} /> : null}
                {bodyText ? (
                    <Text style={[styles.sousText, { color: c.text.primary }]} selectable>
                        {bodyText}
                    </Text>
                ) : null}
                {message.attachment?.fileName ? (
                    <View style={[styles.fileChip, { borderColor: c.border }]}>
                        <Ionicons name="document-outline" size={18} color={c.text.secondary} />
                        <Text style={{ color: c.text.secondary, flex: 1 }} numberOfLines={1}>
                            {message.attachment.fileName}
                        </Text>
                    </View>
                ) : null}
                {isAmpi ? (
                    <PartyAmpiMessageExtras
                        message={extrasMessage}
                        theme={theme}
                        livePartyId={bubbleLivePartyId}
                        defaultLiveMealId={defaultLiveMealId}
                        onMealsChanged={onMealsChanged}
                        onAddRecipeToPartyMeal={onAddRecipeToPartyMeal}
                    />
                ) : null}
            </View>
            {ampiFailed ? (
                <Pressable
                    onPress={onRetryAmpi}
                    disabled={!onRetryAmpi}
                    accessibilityRole="button"
                    accessibilityLabel={`Retry ${ASSISTANT_NAME}`}
                >
                    <Text style={{ color: c.error, fontSize: 12, marginTop: 4, fontWeight: '700' }}>
                        Couldn't finish — tap to retry
                    </Text>
                </Pressable>
            ) : null}
            {canDelete ? (
                <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel="Delete message">
                    <Text style={{ color: c.error, fontSize: 12, marginTop: 2 }}>Delete</Text>
                </Pressable>
            ) : null}
        </View>
    );
}

export default function PartyChatPanel({
    theme,
    livePartyId,
    messages,
    setMessages,
    meals,
    ingredientClaims,
    myDisplayName,
    myMemberId,
    isPartyOwner,
    isDesktop,
    onComposerFocusChange,
    onAddRecipeToPartyMeal,
    onMealsChanged,
    pantryByMember,
    myPantryShareEnabled,
    onMyPantryShareChange,
}) {
    const c = theme.colors;
    const insets = useSafeAreaInsets();
    const defaultLiveMealId = useMemo(() => {
        const meal = (meals || []).find((m) => m.sync_meal_id || m.syncMealId);
        return meal?.sync_meal_id || meal?.syncMealId || null;
    }, [meals]);
    const [input, setInput] = useState('');
    const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);
    const [pendingAttachment, setPendingAttachment] = useState(null);
    const [thinking, setThinking] = useState(false);
    const [composerFocused, setComposerFocusedState] = useState(false);
    const listRef = useRef(null);
    const inputRef = useRef(null);
    const blurTimer = useRef(null);
    const { loadState, loadError, reload: reloadHistory } = usePartyChatHistory(livePartyId, setMessages);
    const { keyboardOpen } = useKeyboardViewport(composerFocused, () =>
        listRef.current?.scrollToEnd?.({ animated: true }),
        { pageBackground: c.background }
    );

    const setComposerActive = useCallback(
        (active) => {
            setComposerFocusedState(active);
            setGlobalComposerFocused(active);
            onComposerFocusChange?.(active);
        },
        [onComposerFocusChange]
    );

    const onComposerFocus = useCallback(() => {
        if (blurTimer.current) clearTimeout(blurTimer.current);
        setComposerActive(true);
    }, [setComposerActive]);

    const onComposerBlur = useCallback(() => {
        if (blurTimer.current) clearTimeout(blurTimer.current);
        blurTimer.current = setTimeout(() => {
            setComposerActive(false);
        }, 150);
    }, [setComposerActive]);

    useEffect(
        () => () => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
            setGlobalComposerFocused(false);
        },
        []
    );

    const grouped = useMemo(
        () =>
            (messages || []).map((m, i, arr) => ({
                ...m,
                role: m.senderMemberId === myMemberId ? 'self' : 'other',
                _position: groupPosition(
                    arr.map((x) => ({
                        role: x.senderMemberId === myMemberId ? 'self' : 'other',
                        createdAt: x.createdAt,
                    })),
                    i
                ),
            })),
        [messages, myMemberId]
    );

    useEffect(() => {
        if (!messages?.length) return;
        listRef.current?.scrollToEnd?.({ animated: true });
    }, [messages?.length, keyboardOpen]);

    const pickAttachment = async () => {
        const img = await ImagePicker.launchImageLibraryAsync({ quality: 0.85 });
        if (!img.canceled && img.assets?.[0]) {
            const a = img.assets[0];
            setPendingAttachment({
                fileName: a.fileName || 'photo.jpg',
                mimeType: a.mimeType || 'image/jpeg',
                sizeBytes: a.fileSize || 0,
                uri: a.uri,
            });
            return;
        }
        const doc = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
        if (!doc.canceled && doc.assets?.[0]) {
            const a = doc.assets[0];
            setPendingAttachment({
                fileName: a.name,
                mimeType: a.mimeType || 'application/octet-stream',
                sizeBytes: a.size || 0,
                uri: a.uri,
            });
        }
    };

    const postUserMessage = useCallback(
        async (body, attachment, { clientId, skipOptimistic } = {}) => {
            const pendingId = clientId || newPendingMessageId();
            const attachMeta = attachment
                ? {
                      fileName: attachment.fileName,
                      mimeType: attachment.mimeType,
                      sizeBytes: attachment.sizeBytes,
                  }
                : null;
            if (!skipOptimistic) {
                setMessages((prev) =>
                    mergePartyChatMessages(prev, [
                        {
                            id: pendingId,
                            body,
                            attachment: attachMeta,
                            sendState: 'pending',
                            createdAt: Date.now(),
                            senderDisplayName: myDisplayName,
                            senderMemberId: myMemberId,
                            isAmpi: false,
                        },
                    ])
                );
            } else {
                setMessages((prev) =>
                    prev.map((m) => (m.id === pendingId ? { ...m, sendState: 'pending', sendError: null } : m))
                );
            }
            try {
                const res = await postPartyChatMessage({
                    livePartyId,
                    body,
                    attachment: attachMeta,
                });
                const msg = res.message;
                if (msg && attachment?.uri) {
                    await savePartyChatAttachmentLocal(msg.id, {
                        uri: attachment.uri,
                        mimeType: attachment.mimeType,
                        fileName: attachment.fileName,
                    });
                }
                setMessages((prev) => {
                    const rest = prev.filter((m) => m.id !== pendingId);
                    return mergePartyChatMessages(rest, [msg]);
                });
                return msg;
            } catch (e) {
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === pendingId
                            ? { ...m, sendState: 'failed', sendError: e?.message || 'Could not send message.' }
                            : m
                    )
                );
                throw e;
            }
        },
        [livePartyId, myDisplayName, myMemberId, setMessages]
    );

    const ensurePantryPromptForMessage = useCallback(
        async (body) => {
            if (!livePartyId || !isPartyPantryMealPrompt(body)) return true;
            if (myPantryShareEnabled) {
                try {
                    await pushPartyPantrySnapshot(livePartyId);
                } catch {
                    // Best-effort refresh before Ampi reads pantries.
                }
                return true;
            }
            const seen = await getPantrySharePromptSeen(livePartyId);
            if (seen) return true;
            return new Promise((resolve) => {
                Alert.alert(
                    'Share your pantry?',
                    `To suggest meals from what the group has on hand, you can share a minimal pantry snapshot (item names, amounts, freshness, expiration) with this party. You can turn this off anytime in party chat.`,
                    [
                        {
                            text: 'Not now',
                            style: 'cancel',
                            onPress: async () => {
                                await setPantrySharePromptSeen(livePartyId);
                                resolve(true);
                            },
                        },
                        {
                            text: 'Share my pantry',
                            onPress: async () => {
                                try {
                                    await setPartyPantryShare(livePartyId, true);
                                    onMyPantryShareChange?.(true);
                                    await setPantrySharePromptSeen(livePartyId);
                                } catch (e) {
                                    Alert.alert('Could not share pantry', e?.message || 'Try again.');
                                    resolve(false);
                                    return;
                                }
                                resolve(true);
                            },
                        },
                    ]
                );
            });
        },
        [livePartyId, myPantryShareEnabled, onMyPantryShareChange]
    );

    const postAmpiMessage = useCallback(
        async (bodyForPost, attachment) => {
            const text = String(bodyForPost || '').trim() || PARTY_AMPI_EMPTY_REPLY;
            const ampiRes = await postPartyChatMessage({
                livePartyId,
                body: text,
                attachment,
                isAmpi: true,
                ampiViaName: myDisplayName || 'You',
            });
            setMessages((prev) => mergePartyChatMessages(prev, [ampiRes.message]));
        },
        [livePartyId, myDisplayName, setMessages]
    );

    const sendMessage = useCallback(
        async (bodyText, { attachment, askAmpi, retryMessageId, skipUserPost } = {}) => {
            if (!livePartyId) return;
            const body = String(bodyText || '').trim();
            if (!body && !attachment) return;
            setThinking(true);
            try {
                const pantryOk = await ensurePantryPromptForMessage(body);
                if (!pantryOk) return;
                let thread = messages;
                if (!skipUserPost) {
                    const msg = await postUserMessage(body, attachment, {
                        clientId: retryMessageId,
                        skipOptimistic: Boolean(retryMessageId),
                    });
                    thread = mergePartyChatMessages(messages, [msg]);
                }
                const partyContext = {
                    livePartyId,
                    pantryByMember,
                    meals,
                    myDisplayName,
                    messages: thread,
                };
                const local = await executePartyChatCommand(body, partyContext);
                if (local) {
                    await postAmpiMessage(local.body, local.attachment);
                    onMealsChanged?.();
                } else if (askAmpi || messageMentionsAmpi(body)) {
                    try {
                        const userPrompt = body.replace(MENTION_RE, ASSISTANT_NAME).trim();
                        const reply = await runPartyAmpiReply({
                            messages: thread,
                            meals,
                            claims: ingredientClaims,
                            pantryByMember,
                            prompt: userPrompt,
                            images: attachment?.mimeType?.startsWith('image/') && attachment.uri
                                ? [{ uri: attachment.uri, mimeType: attachment.mimeType }]
                                : [],
                        });
                        const finalized = await finalizePartyAmpiReplyForPost(reply || '', {
                            userPrompt,
                            partyContext,
                            autoAddToParty: onAddRecipeToPartyMeal
                                ? (recipeId) => onAddRecipeToPartyMeal(recipeId, { saveOnly: false })
                                : undefined,
                        });
                        await postAmpiMessage(finalized.body, finalized.attachment);
                        onMealsChanged?.();
                    } catch (e) {
                        try {
                            await postAmpiMessage(e?.message || PARTY_AMPI_EMPTY_REPLY, {
                                ampi: { cards: [], pendingActions: [], failed: true },
                            });
                        } catch {
                            Alert.alert(ASSISTANT_NAME, e?.message || 'Could not reach AI.');
                        }
                    }
                }
            } catch {
                // Failed rows stay in the list with tap-to-retry.
            } finally {
                setThinking(false);
            }
        },
        [
            livePartyId,
            meals,
            ingredientClaims,
            messages,
            myDisplayName,
            postUserMessage,
            postAmpiMessage,
            onAddRecipeToPartyMeal,
            onMealsChanged,
            pantryByMember,
            ensurePantryPromptForMessage,
        ]
    );

    const releaseComposer = useCallback(() => {
        if (blurTimer.current) clearTimeout(blurTimer.current);
        inputRef.current?.blur?.();
        setComposerActive(false);
    }, [setComposerActive]);

    const onSend = () => {
        const body = input;
        setInput('');
        setInputHeight(INPUT_MIN_HEIGHT);
        const attach = pendingAttachment;
        setPendingAttachment(null);
        releaseComposer();
        void sendMessage(body, { attachment: attach, askAmpi: messageMentionsAmpi(body) });
    };

    const askAmpi = () => {
        setInput(PARTY_AMPI_PANTRY_PREFILL);
        const wrappedLines = Math.max(2, Math.ceil(PARTY_AMPI_PANTRY_PREFILL.length / 28));
        setInputHeight(Math.min(INPUT_MAX_HEIGHT, INPUT_LINE_HEIGHT * wrappedLines + 16));
        inputRef.current?.focus?.();
        onComposerFocus();
    };

    const canSend = Boolean(input.trim() || pendingAttachment) && !thinking;

    if (!livePartyId) {
        return (
            <View style={styles.emptyWrap}>
                <Text style={{ color: c.text.secondary, textAlign: 'center' }}>
                    Party chat needs live sync. Create or join a live party first.
                </Text>
            </View>
        );
    }

    const composerPaddingBottom =
        Platform.OS === 'web' && composerFocused
            ? keyboardOpen
                ? 4
                : Math.max(insets.bottom, 8)
            : composerFocused && !keyboardOpen
              ? Math.max(insets.bottom, 8)
              : 8;

    return (
        <KeyboardAvoidingView
            style={[styles.root, isDesktop && styles.rootDesktop]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
        >
            {loadState === 'loading' ? (
                <View style={[styles.historyBanner, { borderColor: c.border, backgroundColor: c.surfaceMuted }]}>
                    <ActivityIndicator color={theme.primary[500]} />
                    <Text style={{ color: c.text.secondary, marginLeft: 10, fontSize: 14 }}>Loading messages…</Text>
                </View>
            ) : null}
            {loadState === 'error' ? (
                <Pressable
                    onPress={() => reloadHistory()}
                    style={[styles.historyBanner, styles.historyError, { borderColor: c.error, backgroundColor: c.surfaceMuted }]}
                    accessibilityRole="button"
                >
                    <Ionicons name="cloud-offline-outline" size={20} color={c.error} />
                    <Text style={{ color: c.error, marginLeft: 8, flex: 1, fontSize: 14 }}>
                        {loadError || 'Could not load chat history.'} Tap to retry.
                    </Text>
                </Pressable>
            ) : null}
            <FlatList
                ref={listRef}
                data={grouped}
                keyExtractor={(item) => item.id}
                style={styles.list}
                contentContainerStyle={[
                    styles.listContent,
                    !grouped.length && styles.listEmpty,
                ]}
                onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: false })}
                ListEmptyComponent={
                    loadState === 'loading' ? (
                        <View style={styles.chatEmpty} accessibilityRole="text">
                            <ActivityIndicator size="large" color={theme.primary[500]} />
                            <Text style={[styles.chatEmptyBody, { color: c.text.secondary, marginTop: 12 }]}>
                                Loading party chat…
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.chatEmpty} accessibilityRole="text">
                            <Ionicons name="chatbubbles-outline" size={40} color={c.text.tertiary} />
                            <Text style={[styles.chatEmptyTitle, { color: c.text.primary }]}>Party chat</Text>
                            <Text style={[styles.chatEmptyBody, { color: c.text.secondary }]}>
                                Coordinate meals, share updates, or @{ASSISTANT_NAME} for menu ideas.
                            </Text>
                        </View>
                    )
                }
                renderItem={({ item }) => {
                    const isOwn =
                        item.senderMemberId === myMemberId ||
                        item.sendState === 'pending' ||
                        item.sendState === 'failed';
                    const canDelete = (isPartyOwner || isOwn) && !item.sendState;
                    return (
                        <View style={styles.messageRow}>
                            {!isOwn && item._position.first ? (
                                <View
                                    style={[
                                        styles.avatar,
                                        { backgroundColor: avatarColor(item.senderDisplayName, theme) },
                                    ]}
                                >
                                    <Text style={styles.avatarText}>
                                        {(item.senderDisplayName || '?').slice(0, 1).toUpperCase()}
                                    </Text>
                                </View>
                            ) : !isOwn ? (
                                <View style={styles.avatarSpacer} />
                            ) : null}
                            <View style={styles.messageBody}>
                                <PartyChatBubble
                                    message={item}
                                    theme={theme}
                                    position={item._position}
                                    isOwn={isOwn}
                                    canDelete={canDelete}
                                    onDelete={async () => {
                                        if (String(item.id).startsWith('pending-')) {
                                            setMessages((prev) => prev.filter((m) => m.id !== item.id));
                                            return;
                                        }
                                        await deletePartyChatMessage({ livePartyId, messageId: item.id });
                                        setMessages((prev) => prev.filter((m) => m.id !== item.id));
                                    }}
                                    onRetry={
                                        item.sendState === 'failed'
                                            ? () => {
                                                  void sendMessage(item.body, {
                                                      attachment: item.attachment,
                                                      retryMessageId: item.id,
                                                  });
                                              }
                                            : undefined
                                    }
                                    onRetryAmpi={
                                        item.isAmpi && item.attachment?.ampi?.failed
                                            ? () => {
                                                  const idx = messages.findIndex((m) => m.id === item.id);
                                                  const prior = [...messages.slice(0, idx < 0 ? messages.length : idx)]
                                                      .reverse()
                                                      .find((m) => !m.isAmpi && String(m.body || '').trim());
                                                  if (!prior) return;
                                                  void sendMessage(prior.body, {
                                                      attachment: prior.attachment,
                                                      askAmpi: true,
                                                      skipUserPost: true,
                                                  });
                                              }
                                            : undefined
                                    }
                                    onAddRecipeToPartyMeal={onAddRecipeToPartyMeal}
                                    onMealsChanged={onMealsChanged}
                                    livePartyId={livePartyId}
                                    defaultLiveMealId={defaultLiveMealId}
                                />
                                {isOwn && item.attachment?.fileName ? (
                                    <Pressable
                                        onPress={async () => {
                                            const local = await loadPartyChatAttachmentLocal(item.id);
                                            if (local?.uri && Platform.OS === 'web') {
                                                window.open(local.uri, '_blank');
                                            }
                                        }}
                                        style={{ marginTop: 2, alignSelf: 'flex-end' }}
                                    >
                                        <Text style={{ color: theme.primary[600], fontSize: 12 }}>Open your file</Text>
                                    </Pressable>
                                ) : null}
                            </View>
                        </View>
                    );
                }}
            />
            <PartyPantryShareToggle
                theme={theme}
                livePartyId={livePartyId}
                enabled={myPantryShareEnabled}
                onChanged={onMyPantryShareChange}
            />
            {pendingAttachment ? (
                <View style={[styles.pending, { borderColor: c.border, backgroundColor: c.surface }]}>
                    <Text style={{ color: c.text.secondary, flex: 1 }} numberOfLines={1}>
                        {pendingAttachment.fileName}
                    </Text>
                    <Pressable onPress={() => setPendingAttachment(null)} accessibilityLabel="Remove attachment">
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
                        paddingBottom: composerPaddingBottom,
                    },
                ]}
            >
                <View style={styles.composerInputRow}>
                    <TextInput
                        ref={inputRef}
                        value={input}
                        onChangeText={(text) => {
                            setInput(text);
                            if (!text.trim()) setInputHeight(INPUT_MIN_HEIGHT);
                        }}
                        onFocus={onComposerFocus}
                        onBlur={onComposerBlur}
                        placeholder={`Message the party… (@${ASSISTANT_NAME} for help)`}
                        placeholderTextColor={c.text.tertiary}
                        accessibilityLabel="Party chat message"
                        multiline
                        scrollEnabled={inputHeight >= INPUT_MAX_HEIGHT}
                        style={[
                            styles.input,
                            {
                                color: c.text.primary,
                                backgroundColor: c.surface,
                                borderColor: c.border,
                                ...(Platform.OS === 'web' && !input.trim()
                                    ? { minHeight: INPUT_MIN_HEIGHT, maxHeight: INPUT_MAX_HEIGHT }
                                    : { height: Math.max(INPUT_MIN_HEIGHT, inputHeight) }),
                            },
                        ]}
                        onContentSizeChange={(e) => {
                            if (Platform.OS === 'web' && !input.trim()) {
                                setInputHeight(INPUT_MIN_HEIGHT);
                                return;
                            }
                            const measured = e.nativeEvent.contentSize.height + INPUT_V_PAD * 2;
                            const next = Math.min(INPUT_MAX_HEIGHT, Math.max(INPUT_MIN_HEIGHT, measured));
                            setInputHeight(next);
                        }}
                        blurOnSubmit={Platform.OS !== 'web'}
                        onKeyPress={
                            Platform.OS === 'web'
                                ? (e) => {
                                      const key = e.nativeEvent;
                                      if (key.key === 'Enter' && !key.shiftKey && !key.isComposing) {
                                          e.preventDefault();
                                          if (canSend) onSend();
                                      }
                                  }
                                : undefined
                        }
                    />
                    <AnimatedPressable
                        onPress={onSend}
                        disabled={!canSend}
                        scaleTo={motion.scale.press}
                        style={[
                            styles.roundButton,
                            styles.sendButton,
                            {
                                backgroundColor: theme.primary[500],
                                opacity: canSend ? 1 : 0.5,
                            },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Send"
                    >
                        <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
                    </AnimatedPressable>
                </View>
                <View style={styles.composerToolsRow}>
                    <Pressable
                        onPress={pickAttachment}
                        style={[styles.toolButton, { backgroundColor: c.surface, borderColor: c.border }]}
                        accessibilityRole="button"
                        accessibilityLabel="Attach file"
                    >
                        <Ionicons name="attach" size={20} color={c.text.primary} />
                    </Pressable>
                    <Pressable
                        onPress={askAmpi}
                        disabled={thinking}
                        style={[
                            styles.askAmpiPill,
                            { borderColor: c.border, backgroundColor: c.surfaceMuted, opacity: thinking ? 0.6 : 1 },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Ask ${ASSISTANT_NAME}`}
                    >
                        <Text style={[styles.askAmpiText, { color: theme.primary[600] }]}>Ask {ASSISTANT_NAME}</Text>
                    </Pressable>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, minHeight: 0 },
    rootDesktop: { minHeight: 0, borderLeftWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(128,128,128,0.25)' },
    historyBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    historyError: { flexWrap: 'wrap' },
    list: { flex: 1 },
    listContent: { paddingHorizontal: 12, paddingVertical: 8, paddingBottom: 12 },
    listEmpty: { flexGrow: 1, justifyContent: 'center' },
    emptyWrap: { flex: 1, justifyContent: 'center', padding: 24 },
    chatEmpty: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 32, gap: 8 },
    chatEmptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 4 },
    chatEmptyBody: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 300 },
    messageRow: { flexDirection: 'row', gap: 8, marginBottom: 2 },
    messageBody: { flex: 1, minWidth: 0 },
    timestamp: { alignSelf: 'center', fontSize: 11, fontWeight: '600', marginTop: 6, marginBottom: 8, letterSpacing: 0.2 },
    sender: { fontSize: 12, fontWeight: '600', marginBottom: 2, marginLeft: 4 },
    bubble: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, maxWidth: '84%' },
    userBubble: { borderBottomRightRadius: 6 },
    userJoinedTop: { borderTopRightRadius: 6 },
    userJoinedBottom: { borderBottomRightRadius: 6 },
    userText: { color: '#FFFFFF', fontSize: 16, lineHeight: 22 },
    userAttach: { color: '#FFFFFF', fontSize: 13, marginTop: 6, opacity: 0.92 },
    sousBubble: { borderWidth: 1, borderBottomLeftRadius: 6 },
    sousJoinedTop: { borderTopLeftRadius: 6 },
    sousJoinedBottom: { borderBottomLeftRadius: 6 },
    sousText: { fontSize: 16, lineHeight: 22 },
    fileChip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, padding: 8, borderRadius: 10, borderWidth: 1 },
    avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    avatarSpacer: { width: 36 },
    avatarText: { color: '#fff', fontWeight: '700' },
    composerWrap: { paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
    composerInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, width: '100%' },
    composerToolsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, paddingLeft: 2 },
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
    roundButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    sendButton: { borderWidth: 0 },
    askAmpiPill: {
        minHeight: 40,
        paddingHorizontal: 12,
        borderRadius: 18,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    askAmpiText: { fontSize: 13, fontWeight: '700' },
    pending: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginHorizontal: 12,
        marginBottom: 4,
        padding: 8,
        borderRadius: 10,
        borderWidth: 1,
    },
});
