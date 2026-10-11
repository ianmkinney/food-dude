import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const INFO = 'amplifood-sync-v1';
const IV_LEN = 12;
const TAG_LEN = 16;

/** @returns {Buffer | null} 32-byte master key */
export function getSyncEncryptionKeyBuffer() {
    const raw = process.env.SYNC_ENCRYPTION_KEY?.trim();
    if (!raw) return null;
    try {
        const buf = Buffer.from(raw, 'base64');
        if (buf.length === 32) return buf;
    } catch {
        // fall through
    }
    if (/^[0-9a-f]{64}$/i.test(raw)) {
        return Buffer.from(raw, 'hex');
    }
    return null;
}

export function isSyncEncryptionConfigured() {
    return getSyncEncryptionKeyBuffer() != null;
}

/** Fail closed when sync encryption is required. */
export function requireSyncEncryptionKey() {
    const key = getSyncEncryptionKeyBuffer();
    if (!key) {
        throw new Error('SYNC_ENCRYPTION_KEY is not set or invalid (need 32 bytes as base64 or 64-char hex).');
    }
    return key;
}

function deriveUserKey(masterKey, userSub) {
    return hkdfSync('sha256', masterKey, String(userSub), INFO, 32);
}

/** @param {object} payload */
export function encryptSyncPayload(userSub, payload) {
    const master = requireSyncEncryptionKey();
    const key = deriveUserKey(master, userSub);
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const plain = Buffer.from(JSON.stringify(payload), 'utf8');
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]);
}

export function decryptSyncPayload(userSub, ciphertext) {
    const master = requireSyncEncryptionKey();
    const key = deriveUserKey(master, userSub);
    const buf = Buffer.isBuffer(ciphertext) ? ciphertext : Buffer.from(ciphertext);
    if (buf.length < IV_LEN + TAG_LEN + 1) {
        throw new Error('Invalid ciphertext');
    }
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const data = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
}
