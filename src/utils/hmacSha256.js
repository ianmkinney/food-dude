import * as Crypto from 'expo-crypto';
import { base64urlEncode } from './base64url';

function bytesToBinaryString(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) {
        s += String.fromCharCode(bytes[i]);
    }
    return s;
}

function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

async function sha256Bytes(data) {
    const subtle = globalThis.crypto?.subtle;
    if (subtle) {
        const digest = await subtle.digest('SHA-256', data);
        return new Uint8Array(digest);
    }
    const bin = bytesToBinaryString(data);
    const hex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, bin, {
        encoding: Crypto.CryptoEncoding.HEX,
    });
    return hexToBytes(hex);
}

/**
 * HMAC-SHA256 over `message` (UTF-8 string) with `secret` (UTF-8 string).
 * @returns {Promise<string>} base64url signature
 */
export async function hmacSha256Base64Url(secret, message) {
    const enc = new TextEncoder();
    const subtle = globalThis.crypto?.subtle;
    if (subtle) {
        const key = await subtle.importKey(
            'raw',
            enc.encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        const sig = await subtle.sign('HMAC', key, enc.encode(message));
        return base64urlEncode(new Uint8Array(sig));
    }

    const blockSize = 64;
    let keyBytes = enc.encode(secret);
    if (keyBytes.length > blockSize) {
        keyBytes = await sha256Bytes(keyBytes);
    }
    if (keyBytes.length < blockSize) {
        const padded = new Uint8Array(blockSize);
        padded.set(keyBytes);
        keyBytes = padded;
    }
    const ipad = new Uint8Array(blockSize);
    const opad = new Uint8Array(blockSize);
    for (let i = 0; i < blockSize; i++) {
        ipad[i] = keyBytes[i] ^ 0x36;
        opad[i] = keyBytes[i] ^ 0x5c;
    }
    const msgBytes = enc.encode(message);
    const inner = new Uint8Array(blockSize + msgBytes.length);
    inner.set(ipad);
    inner.set(msgBytes, blockSize);
    const innerHash = await sha256Bytes(inner);
    const outer = new Uint8Array(blockSize + innerHash.length);
    outer.set(opad);
    outer.set(innerHash, blockSize);
    const outerHash = await sha256Bytes(outer);
    return base64urlEncode(outerHash);
}

export function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
        return false;
    }
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}
