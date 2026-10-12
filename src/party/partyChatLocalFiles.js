import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'amplifood.party.chat.file.';

/** Persist attachment bytes only on this device (keyed by server message id). */
export async function savePartyChatAttachmentLocal(messageId, payload) {
    if (!messageId || !payload) return;
    await AsyncStorage.setItem(
        `${PREFIX}${messageId}`,
        JSON.stringify({
            uri: payload.uri || null,
            base64: payload.base64 || null,
            mimeType: payload.mimeType || 'application/octet-stream',
            fileName: payload.fileName || 'file',
        })
    );
}

export async function loadPartyChatAttachmentLocal(messageId) {
    if (!messageId) return null;
    const raw = await AsyncStorage.getItem(`${PREFIX}${messageId}`);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export async function removePartyChatAttachmentLocal(messageId) {
    if (!messageId) return;
    await AsyncStorage.removeItem(`${PREFIX}${messageId}`);
}
