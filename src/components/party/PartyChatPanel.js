import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { finalizePartyAmpiReplyForPost, messageMentionsAmpi, runPartyAmpiReply } from '../../services/partyAmpiChat';
import { savePartyChatAttachmentLocal, loadPartyChatAttachmentLocal } from '../../party/partyChatLocalFiles';

const MENTION_RE = /@ampi\b/i;
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

function PartyChatBubble({ message, theme, position, isOwn, onDelete, canDelete }) {
    const c = theme.colors;
    const isAmpi = message.isAmpi;
    const bodyText = isAmpi ? toDisplayText(message.body || '') : message.body;
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
                        { backgroundColor: theme.primary[500], alignSelf: 'flex-end' },
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
                {canDelete ? (
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
            </View>
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
}) {
    const c = theme.colors;
    const insets = useSafeAreaInsets();
    const [input, setInput] = useState('');
    const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);
    const [pendingAttachment, setPendingAttachment] = useState(null);
    const [thinking, setThinking] = useState(false);
    const [composerFocused, setComposerFocusedState] = useState(false);
    const listRef = useRef(null);
    const inputRef = useRef(null);
    const blurTimer = useRef(null);
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

    const sendMessage = useCallback(
        async (bodyText, { attachment, askAmpi } = {}) => {
            if (!livePartyId) return;
            const body = String(bodyText || '').trim();
            if (!body && !attachment) return;
            setThinking(true);
            try {
                const res = await postPartyChatMessage({
                    livePartyId,
                    body,
                    attachment: attachment
                        ? {
                              fileName: attachment.fileName,
                              mimeType: attachment.mimeType,
                              sizeBytes: attachment.sizeBytes,
                          }
                        : null,
                });
                const msg = res.message;
                if (msg && attachment?.uri) {
                    await savePartyChatAttachmentLocal(msg.id, {
                        uri: attachment.uri,
                        mimeType: attachment.mimeType,
                        fileName: attachment.fileName,
                    });
                }
                setMessages((prev) => mergePartyChatMessages(prev, [msg]));
                if (askAmpi || messageMentionsAmpi(body)) {
                    try {
                        const reply = await runPartyAmpiReply({
                            messages: mergePartyChatMessages(messages, [msg]),
                            meals,
                            claims: ingredientClaims,
                            prompt: body.replace(MENTION_RE, ASSISTANT_NAME).trim(),
                            images: attachment?.mimeType?.startsWith('image/') && attachment.uri
                                ? [{ uri: attachment.uri, mimeType: attachment.mimeType }]
                                : [],
                        });
                        if (reply) {
                            const bodyForPost = await finalizePartyAmpiReplyForPost(reply);
                            if (!bodyForPost) return;
                            const ampiRes = await postPartyChatMessage({
                                livePartyId,
                                body: bodyForPost,
                                isAmpi: true,
                                ampiViaName: myDisplayName || 'You',
                            });
                            setMessages((prev) => mergePartyChatMessages(prev, [ampiRes.message]));
                        }
                    } catch (e) {
                        Alert.alert(ASSISTANT_NAME, e?.message || 'Could not reach AI.');
                    }
                }
            } catch (e) {
                Alert.alert('Chat', e?.message || 'Could not send message.');
            } finally {
                setThinking(false);
            }
        },
        [livePartyId, meals, ingredientClaims, messages, myDisplayName, setMessages]
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
        const body = input.trim() || `Hey @${ASSISTANT_NAME}, what should we cook?`;
        setInput('');
        setInputHeight(INPUT_MIN_HEIGHT);
        releaseComposer();
        void sendMessage(body, { askAmpi: true });
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
                    <View style={styles.chatEmpty} accessibilityRole="text">
                        <Ionicons name="chatbubbles-outline" size={40} color={c.text.tertiary} />
                        <Text style={[styles.chatEmptyTitle, { color: c.text.primary }]}>Party chat</Text>
                        <Text style={[styles.chatEmptyBody, { color: c.text.secondary }]}>
                            Coordinate meals, share updates, or @{ASSISTANT_NAME} for menu ideas.
                        </Text>
                    </View>
                }
                renderItem={({ item }) => {
                    const isOwn = item.senderMemberId === myMemberId;
                    const canDelete = isPartyOwner || isOwn;
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
                                        await deletePartyChatMessage({ livePartyId, messageId: item.id });
                                        setMessages((prev) => prev.filter((m) => m.id !== item.id));
                                    }}
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
