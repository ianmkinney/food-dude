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
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { AiBadge } from '../../ai/AiLabel';
import AnimatedPressable from '../AnimatedPressable';
import { formatChatTime, groupPosition } from '../../chat/messageGroups';
import { useKeyboardViewport } from '../../chat/useKeyboardViewport';
import { ASSISTANT_NAME } from '../../config/assistant';
import {
    deletePartyChatMessage,
    mergePartyChatMessages,
    postPartyChatMessage,
} from '../../services/partyLiveSync';
import { messageMentionsAmpi, runPartyAmpiReply } from '../../services/partyAmpiChat';
import { savePartyChatAttachmentLocal, loadPartyChatAttachmentLocal } from '../../party/partyChatLocalFiles';

const MENTION_RE = /@ampi\b/i;
const INPUT_MIN = 44;
const INPUT_MAX = 120;

function avatarColor(name, theme) {
    const palette = [theme.primary[500], theme.colors.error, '#4F802F', '#8B5CF6'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = (h + name.charCodeAt(i)) % palette.length;
    return palette[h];
}

function PartyChatBubble({ message, theme, position, isOwn, onDelete, canDelete }) {
    const c = theme.colors;
    const align = isOwn ? 'flex-end' : 'flex-start';
    const bg = message.isAmpi ? theme.primary[100] : isOwn ? theme.primary[500] : c.surfaceElevated;
    const textColor = isOwn && !message.isAmpi ? '#FFFFFF' : c.text.primary;
    return (
        <View style={{ alignItems: align, marginBottom: position.last ? 10 : 2, paddingHorizontal: 12 }}>
            {position.showTime ? (
                <Text style={[styles.time, { color: c.text.tertiary }]}>{formatChatTime(message.createdAt)}</Text>
            ) : null}
            {!isOwn && position.first ? (
                <Text style={[styles.sender, { color: c.text.secondary }]}>{message.senderDisplayName}</Text>
            ) : null}
            <View style={[styles.bubble, { backgroundColor: bg, borderColor: c.borderSoft }]}>
                {message.isAmpi ? <AiBadge style={{ marginBottom: 4 }} /> : null}
                {message.body ? <Text style={{ color: textColor, fontSize: 16, lineHeight: 22 }}>{message.body}</Text> : null}
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
}) {
    const c = theme.colors;
    const [input, setInput] = useState('');
    const [inputHeight, setInputHeight] = useState(INPUT_MIN);
    const [pendingAttachment, setPendingAttachment] = useState(null);
    const [thinking, setThinking] = useState(false);
    const [composerFocused, setComposerFocused] = useState(false);
    const listRef = useRef(null);
    const { keyboardOpen } = useKeyboardViewport(composerFocused && Platform.OS === 'web');

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
                            const ampiRes = await postPartyChatMessage({
                                livePartyId,
                                body: reply,
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

    const onSend = () => {
        const body = input;
        setInput('');
        setInputHeight(INPUT_MIN);
        const attach = pendingAttachment;
        setPendingAttachment(null);
        void sendMessage(body, { attachment: attach, askAmpi: messageMentionsAmpi(body) });
    };

    const askAmpi = () => {
        const body = input.trim() || `Hey @${ASSISTANT_NAME}, what should we cook?`;
        setInput('');
        void sendMessage(body, { askAmpi: true });
    };

    if (!livePartyId) {
        return (
            <View style={styles.empty}>
                <Text style={{ color: c.text.secondary, textAlign: 'center' }}>
                    Party chat needs live sync. Create or join a live party first.
                </Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={[styles.root, isDesktop && styles.rootDesktop]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={88}
        >
            <FlatList
                ref={listRef}
                data={grouped}
                keyExtractor={(item) => item.id}
                style={styles.list}
                contentContainerStyle={{ paddingVertical: 8, paddingBottom: 12 }}
                onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: false })}
                renderItem={({ item }) => {
                    const isOwn = item.senderMemberId === myMemberId;
                    const canDelete = isPartyOwner || isOwn;
                    return (
                        <View style={{ flexDirection: 'row', gap: 8, paddingRight: isOwn ? 0 : 8 }}>
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
                                <View style={{ width: 36 }} />
                            ) : null}
                            <View style={{ flex: 1 }}>
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
                                        style={{ marginTop: 2 }}
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
                <View style={[styles.pending, { borderColor: c.border }]}>
                    <Text style={{ color: c.text.secondary, flex: 1 }} numberOfLines={1}>
                        {pendingAttachment.fileName}
                    </Text>
                    <Pressable onPress={() => setPendingAttachment(null)}>
                        <Ionicons name="close-circle" size={22} color={c.text.tertiary} />
                    </Pressable>
                </View>
            ) : null}
            <View style={[styles.composer, { borderTopColor: c.borderSoft, backgroundColor: c.background }]}>
                <Pressable onPress={pickAttachment} style={styles.tool} accessibilityLabel="Attach file">
                    <Ionicons name="attach" size={22} color={c.text.primary} />
                </Pressable>
                <TextInput
                    value={input}
                    onChangeText={setInput}
                    onFocus={() => setComposerFocused(true)}
                    onBlur={() => setComposerFocused(false)}
                    placeholder="Message the party… (@Ampi for help)"
                    placeholderTextColor={c.text.tertiary}
                    multiline
                    style={[
                        styles.input,
                        {
                            color: c.text.primary,
                            backgroundColor: c.surface,
                            borderColor: c.border,
                            height: Math.min(INPUT_MAX, Math.max(INPUT_MIN, inputHeight)),
                        },
                    ]}
                    onContentSizeChange={(e) => {
                        const h = e.nativeEvent.contentSize.height + 16;
                        setInputHeight(Math.min(INPUT_MAX, Math.max(INPUT_MIN, h)));
                    }}
                />
                <AnimatedPressable
                    onPress={askAmpi}
                    disabled={thinking}
                    style={[styles.tool, { borderColor: c.border, borderWidth: 1 }]}
                    accessibilityLabel={`Ask ${ASSISTANT_NAME}`}
                >
                    <Text style={{ color: theme.primary[600], fontWeight: '700', fontSize: 12 }}>Ask {ASSISTANT_NAME}</Text>
                </AnimatedPressable>
                <AnimatedPressable
                    onPress={onSend}
                    disabled={thinking || (!input.trim() && !pendingAttachment)}
                    style={[styles.send, { backgroundColor: theme.primary[500], opacity: thinking ? 0.6 : 1 }]}
                    accessibilityLabel="Send"
                >
                    <Ionicons name="arrow-up" size={20} color="#fff" />
                </AnimatedPressable>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, minHeight: 280 },
    rootDesktop: { minHeight: 0, borderLeftWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(128,128,128,0.25)' },
    list: { flex: 1 },
    empty: { flex: 1, justifyContent: 'center', padding: 24 },
    time: { textAlign: 'center', fontSize: 12, marginBottom: 8 },
    sender: { fontSize: 12, fontWeight: '600', marginBottom: 2, marginLeft: 4 },
    bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '100%', borderWidth: StyleSheet.hairlineWidth },
    fileChip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, padding: 8, borderRadius: 10, borderWidth: 1 },
    avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#fff', fontWeight: '700' },
    composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: StyleSheet.hairlineWidth },
    input: { flex: 1, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, fontSize: 16 },
    tool: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingHorizontal: 6 },
    send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    pending: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginBottom: 4, padding: 8, borderRadius: 10, borderWidth: 1 },
});
