import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

// Browser counterpart of expo-camera's CameraView for grocery barcodes. Uses the
// native BarcodeDetector where it supports retail formats (Chrome/Edge/Samsung
// on Android), otherwise a lazily loaded zxing decoder (iOS Safari, Firefox).
// Keeps the expo-camera surface the screens use: CameraView, onBarcodeScanned,
// onMountError, useCameraPermissions.

const DETECTOR_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const EXPO_TYPE = { ean_13: 'ean13', ean_8: 'ean8', upc_a: 'upc_a', upc_e: 'upc_e' };
const SCAN_INTERVAL_MS = 150;
// Decoding a centre band of a downscaled frame keeps zxing fast on phones.
const DECODE_WIDTH = 960;

export const isCameraAvailable =
    typeof window !== 'undefined' &&
    window.isSecureContext !== false &&
    !!navigator.mediaDevices?.getUserMedia;

const cameraConstraints = (facing) => ({
    audio: false,
    video: {
        facingMode: { ideal: facing === 'front' ? 'user' : 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
    },
});

const toPermission = (granted, error) => ({
    granted,
    canAskAgain: !granted && error?.name !== 'NotAllowedError',
    status: granted ? 'granted' : 'denied',
    expires: 'never',
    error: error?.name,
});

export function describeCameraError(error) {
    switch (error?.name) {
        case 'NotAllowedError':
        case 'SecurityError':
            return 'Camera access was blocked. Allow the camera for this site in your browser settings, or type the barcode or product name instead.';
        case 'NotFoundError':
        case 'OverconstrainedError':
            return 'No camera was found on this device. Type the barcode or product name instead.';
        case 'NotReadableError':
            return 'The camera is in use by another app or tab. Close it and try again, or type the product name instead.';
        default:
            return 'The camera could not start. Type the barcode or product name instead.';
    }
}

export function useCameraPermissions() {
    const [permission, setPermission] = useState(null);

    useEffect(() => {
        let cancelled = false;
        navigator.permissions
            ?.query({ name: 'camera' })
            .then((result) => {
                if (!cancelled && result.state === 'granted') setPermission(toPermission(true));
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    const requestPermission = useCallback(async () => {
        if (!isCameraAvailable) {
            const result = toPermission(false, { name: 'NotFoundError' });
            setPermission(result);
            return result;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia(cameraConstraints('back'));
            stream.getTracks().forEach((track) => track.stop());
            const result = toPermission(true);
            setPermission(result);
            return result;
        } catch (error) {
            const result = toPermission(false, error);
            setPermission(result);
            return result;
        }
    }, []);

    return [permission, requestPermission];
}

async function createNativeDetector() {
    const Detector = typeof window !== 'undefined' ? window.BarcodeDetector : undefined;
    if (!Detector) return null;
    try {
        const supported = await Detector.getSupportedFormats();
        const formats = DETECTOR_FORMATS.filter((format) => supported.includes(format));
        if (!formats.includes('ean_13')) return null;
        const detector = new Detector({ formats });
        return async (video) => {
            const [hit] = await detector.detect(video);
            return hit ? { type: EXPO_TYPE[hit.format] || hit.format, data: hit.rawValue } : null;
        };
    } catch {
        return null;
    }
}

async function createZxingDecoder() {
    const ZXing = await import('@zxing/library');
    const reader = new ZXing.MultiFormatReader();
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
        ZXing.BarcodeFormat.EAN_13,
        ZXing.BarcodeFormat.EAN_8,
        ZXing.BarcodeFormat.UPC_A,
        ZXing.BarcodeFormat.UPC_E,
    ]);
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    reader.setHints(hints);
    const names = {
        [ZXing.BarcodeFormat.EAN_13]: 'ean13',
        [ZXing.BarcodeFormat.EAN_8]: 'ean8',
        [ZXing.BarcodeFormat.UPC_A]: 'upc_a',
        [ZXing.BarcodeFormat.UPC_E]: 'upc_e',
    };

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    return async (video) => {
        const { videoWidth, videoHeight } = video;
        if (!videoWidth || !videoHeight) return null;
        const scale = Math.min(1, DECODE_WIDTH / videoWidth);
        const width = Math.round(videoWidth * scale);
        const bandHeight = Math.round(videoHeight * 0.5 * scale);
        canvas.width = width;
        canvas.height = bandHeight;
        ctx.drawImage(video, 0, videoHeight * 0.25, videoWidth, videoHeight * 0.5, 0, 0, width, bandHeight);
        const { data } = ctx.getImageData(0, 0, width, bandHeight);
        const luminance = new Uint8ClampedArray(width * bandHeight);
        for (let i = 0, p = 0; i < luminance.length; i += 1, p += 4) {
            luminance[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
        }
        const bitmap = new ZXing.BinaryBitmap(
            new ZXing.HybridBinarizer(new ZXing.RGBLuminanceSource(luminance, width, bandHeight))
        );
        try {
            const result = reader.decodeWithState(bitmap);
            return { type: names[result.getBarcodeFormat()] || 'ean13', data: result.getText() };
        } catch {
            return null;
        } finally {
            reader.reset();
        }
    };
}

let decoderPromise = null;
const getDecoder = () => {
    decoderPromise ||= createNativeDetector().then((native) => native || createZxingDecoder());
    decoderPromise.catch(() => {
        decoderPromise = null;
    });
    return decoderPromise;
};

export function CameraView({ style, facing = 'back', onBarcodeScanned, onMountError, onCameraReady, children }) {
    const videoRef = useRef(null);
    const onScanRef = useRef(onBarcodeScanned);
    onScanRef.current = onBarcodeScanned;
    const onErrorRef = useRef(onMountError);
    onErrorRef.current = onMountError;

    useEffect(() => {
        let stream = null;
        let timer = null;
        let stopped = false;

        const loop = async (decode) => {
            if (stopped) return;
            const video = videoRef.current;
            if (onScanRef.current && video && video.readyState >= 2) {
                try {
                    const hit = await decode(video);
                    if (hit?.data && onScanRef.current && !stopped) {
                        onScanRef.current({ type: hit.type, data: hit.data });
                    }
                } catch {
                    // A frame that fails to decode is normal; keep scanning.
                }
            }
            timer = setTimeout(() => loop(decode), SCAN_INTERVAL_MS);
        };

        (async () => {
            try {
                if (!isCameraAvailable) {
                    throw Object.assign(new Error('Camera unavailable'), { name: 'NotFoundError' });
                }
                stream = await navigator.mediaDevices.getUserMedia(cameraConstraints(facing));
                if (stopped) return;
                const video = videoRef.current;
                video.srcObject = stream;
                await video.play().catch(() => {});
                onCameraReady?.();
                loop(await getDecoder());
            } catch (error) {
                if (!stopped) {
                    onErrorRef.current?.({ message: describeCameraError(error), name: error?.name });
                }
            }
        })();

        return () => {
            stopped = true;
            clearTimeout(timer);
            stream?.getTracks().forEach((track) => track.stop());
        };
    }, [facing]);

    return (
        <View style={[styles.root, style]}>
            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <View style={StyleSheet.absoluteFill}>{children}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        overflow: 'hidden',
        backgroundColor: '#000',
    },
});
