import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { prepareImageForAi } from '../services/mediaPrep';
import type { PlatformImage } from '../monetization/platformAi';
import {
    ATTACHMENT_SOURCE_LABEL,
    MAX_ATTACHMENTS,
    MAX_IMAGE_BYTES,
    MAX_PDF_BYTES,
    MAX_TEXT_BYTES,
    MAX_VISION_IMAGES,
    TEXT_EXTENSIONS,
} from './attachmentLimits';
import { preparePdfFromBytes } from './preparePdf';

export type PendingAttachment = {
    id: string;
    name: string;
    kind: 'image' | 'pdf' | 'text';
    /** Local URI, web blob URL, or raw text for text kind */
    uri: string;
    mimeType?: string;
    sizeBytes?: number;
    previewUri?: string;
    /** Web only: the picked file, read directly so CSP connect-src needn't allow blob: */
    file?: Blob;
};

export type PreparedChatAttachment = {
    name: string;
    kind: PendingAttachment['kind'];
    sourceLabel: typeof ATTACHMENT_SOURCE_LABEL;
    textSnippet: string;
    /** First user image URI to reuse as recipe cover when importing */
    recipeImageUri?: string | null;
};

export type PreparedAttachmentPayload = {
    promptExtra: string;
    images: PlatformImage[];
    attachments: PreparedChatAttachment[];
};

let nextId = 0;
export const newAttachmentId = () => `a${Date.now()}-${nextId++}`;

function ext(name: string) {
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function classifyFile(name: string, mimeType?: string): PendingAttachment['kind'] | null {
    const e = ext(name);
    const m = (mimeType || '').toLowerCase();
    if (m.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(e)) return 'image';
    if (m === 'application/pdf' || e === 'pdf') return 'pdf';
    if (m.startsWith('text/') || TEXT_EXTENSIONS.has(e)) return 'text';
    return null;
}

async function readBytes(uri: string, file?: Blob): Promise<Uint8Array> {
    if (Platform.OS === 'web') {
        const blob = file ?? (await (await fetch(uri)).blob());
        return new Uint8Array(await blob.arrayBuffer());
    }
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function readText(uri: string, file?: Blob): Promise<string> {
    if (Platform.OS === 'web') {
        return file ? file.text() : fetch(uri).then((r) => r.text());
    }
    return FileSystem.readAsStringAsync(uri);
}

export function validatePending(list: PendingAttachment[]): string | null {
    if (list.length > MAX_ATTACHMENTS) return `You can attach up to ${MAX_ATTACHMENTS} files at a time.`;
    for (const item of list) {
        const size = item.sizeBytes ?? 0;
        if (item.kind === 'image' && size > MAX_IMAGE_BYTES) return `${item.name} is too large (max 4 MB).`;
        if (item.kind === 'pdf' && size > MAX_PDF_BYTES) return `${item.name} is too large (max 8 MB).`;
        if (item.kind === 'text' && size > MAX_TEXT_BYTES) return `${item.name} is too large (max 512 KB).`;
    }
    return null;
}

/** Turn pending picks into model input (text blocks + vision images). */
export async function prepareAttachmentPayload(list: PendingAttachment[]): Promise<PreparedAttachmentPayload> {
    const err = validatePending(list);
    if (err) throw new Error(err);

    const images: PlatformImage[] = [];
    const attachments: PreparedChatAttachment[] = [];
    const textParts: string[] = [];
    let recipeImageUri: string | null = null;

    for (const item of list) {
        if (item.kind === 'image') {
            const ready = await prepareImageForAi({ uri: item.uri, mimeType: item.mimeType });
            if (images.length < MAX_VISION_IMAGES) {
                images.push({ data: ready.base64, mimeType: ready.mimeType });
            }
            if (!recipeImageUri) recipeImageUri = item.uri;
            const snippet = `[Image: ${item.name}]`;
            textParts.push(snippet);
            attachments.push({
                name: item.name,
                kind: 'image',
                sourceLabel: ATTACHMENT_SOURCE_LABEL,
                textSnippet: snippet,
                recipeImageUri,
            });
            continue;
        }
        if (item.kind === 'text') {
            const raw = item.kind === 'text' && item.uri.startsWith('text:') ? decodeURIComponent(item.uri.slice(5)) : await readText(item.uri, item.file);
            const clipped = raw.length > 40_000 ? `${raw.slice(0, 40_000)}\n…(truncated)` : raw;
            const snippet = `--- ${item.name} ---\n${clipped}`;
            textParts.push(snippet);
            attachments.push({
                name: item.name,
                kind: 'text',
                sourceLabel: ATTACHMENT_SOURCE_LABEL,
                textSnippet: clipped.slice(0, 200),
                recipeImageUri: null,
            });
            continue;
        }
        if (item.kind === 'pdf') {
            const bytes = await readBytes(item.uri, item.file);
            const { text, pageImages } = await preparePdfFromBytes(bytes, item.name);
            for (const img of pageImages) {
                if (images.length < MAX_VISION_IMAGES) images.push(img);
            }
            const snippet = `--- PDF: ${item.name} ---\n${text}`;
            textParts.push(snippet);
            attachments.push({
                name: item.name,
                kind: 'pdf',
                sourceLabel: ATTACHMENT_SOURCE_LABEL,
                textSnippet: text.slice(0, 200),
                recipeImageUri: null,
            });
        }
    }

    const promptExtra = textParts.length
        ? `\n\nAttached files (${ATTACHMENT_SOURCE_LABEL}):\n${textParts.join('\n\n')}`
        : '';
    if (recipeImageUri) {
        for (const a of attachments) {
            if (a.kind === 'image') a.recipeImageUri = recipeImageUri;
        }
    }
    return { promptExtra, images, attachments };
}
