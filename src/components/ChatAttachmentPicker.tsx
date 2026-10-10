import React, { useRef } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
    classifyFile,
    newAttachmentId,
    type PendingAttachment,
    validatePending,
} from '../sous/chatAttachments';

type Props = {
    attachments: PendingAttachment[];
    onChange: (next: PendingAttachment[]) => void;
    theme: ReturnType<typeof import('../theme').getTheme>;
    /** chips = preview row only; button = attach control only; full = both */
    layout?: 'full' | 'chips' | 'button';
};

const ACCEPT =
    'image/*,.pdf,.txt,.md,.markdown,.html,.htm,text/plain,text/markdown,text/html';

export default function ChatAttachmentPicker({ attachments, onChange, theme, layout = 'full' }: Props) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const c = theme.colors;

    const add = (items: PendingAttachment[]) => {
        const merged = [...attachments, ...items];
        const err = validatePending(merged);
        if (err) {
            Alert.alert('Attachments', err);
            return;
        }
        onChange(merged);
    };

    const pickNative = async () => {
        Alert.alert('Attach', undefined, [
            {
                text: 'Photo library',
                onPress: async () => {
                    const result = await ImagePicker.launchImageLibraryAsync({
                        mediaTypes: ['images'],
                        quality: 0.85,
                        allowsMultipleSelection: true,
                        selectionLimit: 5,
                    });
                    if (result.canceled) return;
                    add(
                        result.assets.map((asset) => ({
                            id: newAttachmentId(),
                            name: asset.fileName || 'photo.jpg',
                            kind: 'image',
                            uri: asset.uri,
                            mimeType: asset.mimeType || 'image/jpeg',
                            sizeBytes: asset.fileSize,
                            previewUri: asset.uri,
                        }))
                    );
                },
            },
            {
                text: 'Camera',
                onPress: async () => {
                    const perm = await ImagePicker.requestCameraPermissionsAsync();
                    if (!perm.granted) {
                        Alert.alert('Camera', 'Allow the camera to take a photo.');
                        return;
                    }
                    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
                    if (result.canceled) return;
                    const asset = result.assets[0];
                    add([
                        {
                            id: newAttachmentId(),
                            name: asset.fileName || 'photo.jpg',
                            kind: 'image',
                            uri: asset.uri,
                            mimeType: asset.mimeType || 'image/jpeg',
                            sizeBytes: asset.fileSize,
                            previewUri: asset.uri,
                        },
                    ]);
                },
            },
            {
                text: 'File (PDF, text, HTML)',
                onPress: async () => {
                    const result = await DocumentPicker.getDocumentAsync({
                        copyToCacheDirectory: true,
                        multiple: true,
                        type: ['application/pdf', 'text/*', 'text/html', 'text/plain', 'text/markdown'],
                    });
                    if (result.canceled) return;
                    const picked = result.assets
                        .map((asset) => {
                            const kind = classifyFile(asset.name, asset.mimeType || undefined);
                            if (!kind) return null;
                            return {
                                id: newAttachmentId(),
                                name: asset.name,
                                kind,
                                uri: asset.uri,
                                mimeType: asset.mimeType,
                                sizeBytes: asset.size,
                                previewUri: kind === 'image' ? asset.uri : undefined,
                            } satisfies PendingAttachment;
                        })
                        .filter(Boolean) as PendingAttachment[];
                    if (picked.length) add(picked);
                },
            },
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    const onWebFiles = async (fileList: FileList | null) => {
        if (!fileList?.length) return;
        const picked: PendingAttachment[] = [];
        for (const file of Array.from(fileList)) {
            const kind = classifyFile(file.name, file.type);
            if (!kind) continue;
            const uri = URL.createObjectURL(file);
            picked.push({
                id: newAttachmentId(),
                name: file.name,
                kind,
                uri,
                mimeType: file.type,
                sizeBytes: file.size,
                previewUri: kind === 'image' ? uri : undefined,
            });
        }
        if (picked.length) add(picked);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const openPicker = () => {
        if (Platform.OS === 'web') {
            fileInputRef.current?.click();
            return;
        }
        pickNative();
    };

    const remove = (id: string) => onChange(attachments.filter((a) => a.id !== id));

    const showChips = layout === 'full' || layout === 'chips';
    const showButton = layout === 'full' || layout === 'button';

    return (
        <View>
            {Platform.OS === 'web' && showButton && (
                <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPT}
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => onWebFiles(e.target.files)}
                />
            )}
            {showChips && attachments.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={styles.chipsInner}>
                    {attachments.map((item) => (
                        <View key={item.id} style={[styles.chip, { borderColor: c.border, backgroundColor: c.surface }]}>
                            {item.previewUri ? (
                                <Image source={{ uri: item.previewUri }} style={styles.thumb} accessibilityIgnoresInvertColors />
                            ) : (
                                <Ionicons
                                    name={item.kind === 'pdf' ? 'document-text-outline' : 'document-outline'}
                                    size={18}
                                    color={theme.primary[500]}
                                />
                            )}
                            <Text style={[styles.chipText, { color: c.text.primary }]} numberOfLines={1}>{item.name}</Text>
                            <Pressable onPress={() => remove(item.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`}>
                                <Ionicons name="close-circle" size={18} color={c.text.tertiary} />
                            </Pressable>
                        </View>
                    ))}
                </ScrollView>
            )}
            {showButton ? (
                <Pressable onPress={openPicker} style={styles.attachBtn} accessibilityRole="button" accessibilityLabel="Attach photo or file">
                    <Ionicons name="attach" size={22} color={c.text.primary} />
                </Pressable>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    chips: { maxHeight: 52, marginBottom: 6 },
    chipsInner: { gap: 8, paddingHorizontal: 2 },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 10,
        maxWidth: 200,
    },
    thumb: { width: 28, height: 28, borderRadius: 6 },
    chipText: { fontSize: 13, fontWeight: '600', flexShrink: 1, maxWidth: 120 },
    attachBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
