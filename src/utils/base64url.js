/** @param {Uint8Array} bytes */
export function base64urlEncode(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    let b64;
    if (typeof globalThis.btoa === 'function') {
        b64 = globalThis.btoa(binary);
    } else if (typeof Buffer !== 'undefined') {
        b64 = Buffer.from(bytes).toString('base64');
    } else {
        throw new Error('Base64 encoding is not available');
    }
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** @returns {Uint8Array} */
export function base64urlDecode(str) {
    const padded = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const b64 = padded + pad;
    let binary;
    if (typeof globalThis.atob === 'function') {
        binary = globalThis.atob(b64);
    } else if (typeof Buffer !== 'undefined') {
        binary = Buffer.from(b64, 'base64').toString('binary');
    } else {
        throw new Error('Base64 decoding is not available');
    }
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        out[i] = binary.charCodeAt(i);
    }
    return out;
}
