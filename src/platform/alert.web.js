import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';

// react-native-web ships `Alert.alert` as a no-op. This keeps the native call
// signature but never leaves a screen blocked behind a dialog nobody can close:
// - Acknowledge-only alerts (no buttons, or a single OK/Got it/Done) become a
//   toast that doesn't take pointer events away from the page. Their OK handler
//   runs right away, since the user has nothing to choose.
// - Alerts with a real choice open a dialog that Escape and a tap outside both
//   dismiss, traps focus while open (react-native-web Modal) and starts on the
//   safest button.

const ACKNOWLEDGE = /^(ok|okay|got it|done|close|dismiss|continue)$/i;
const ERROR_TITLE = /error|fail|couldn['’]?t|can['’]?t|cannot|unable|invalid|missing|denied|not (found|allowed|available)/i;
const MAX_TOASTS = 3;

const toasts = [];
const dialogs = [];
const listeners = new Set();
let nextId = 1;
const emit = () => listeners.forEach((fn) => fn());

export function isAcknowledgeOnly(buttons) {
    if (!Array.isArray(buttons) || buttons.length === 0) return true;
    return buttons.length === 1 && ACKNOWLEDGE.test(String(buttons[0]?.text ?? 'OK').trim());
}

function toastDuration(text, tone) {
    const base = Math.min(9000, 4000 + text.length * 35);
    return tone === 'error' ? Math.min(12000, base * 1.5) : base;
}

export function dismissToast(id) {
    const index = toasts.findIndex((t) => t.id === id);
    if (index === -1) return;
    const [toast] = toasts.splice(index, 1);
    clearTimeout(toast.timer);
    toast.onDismiss?.();
    emit();
}

function showToast({ title, message, onDismiss }) {
    const tone = ERROR_TITLE.test(title) ? 'error' : 'info';
    const toast = { id: nextId++, title, message, tone, onDismiss };
    toast.timer = setTimeout(() => dismissToast(toast.id), toastDuration(`${title} ${message}`, tone));
    toasts.push(toast);
    while (toasts.length > MAX_TOASTS) dismissToast(toasts[0].id);
    emit();
}

export function installAlertPolyfill() {
    Alert.alert = (title, message, buttons, options) => {
        const text = {
            title: title == null ? '' : String(title),
            message: message == null ? '' : String(message),
        };
        if (isAcknowledgeOnly(buttons)) {
            showToast({ ...text, onDismiss: options?.onDismiss });
            const onPress = Array.isArray(buttons) ? buttons[0]?.onPress : undefined;
            if (onPress) setTimeout(onPress, 0);
            return;
        }
        dialogs.push({ id: nextId++, ...text, buttons, onDismiss: options?.onDismiss });
        emit();
    };
}

function useAlertState() {
    const [, setTick] = useState(0);
    useEffect(() => {
        const listener = () => setTick((n) => n + 1);
        listeners.add(listener);
        return () => listeners.delete(listener);
    }, []);
    return { toast: [...toasts], dialog: dialogs[0] || null };
}

function closeDialog(button) {
    const current = dialogs.shift();
    emit();
    if (button) button.onPress?.();
    else current?.onDismiss?.();
}

function Toasts({ items, theme }) {
    if (!items.length) return null;
    // Portalled to <body> so a toast raised from inside an open modal sheet
    // shows above it (react-native-web modals sit at z-index 9999).
    return createPortal(
        <View style={styles.toastLayer} pointerEvents="box-none">
            {items.map((toast) => {
                const isError = toast.tone === 'error';
                return (
                    <Pressable
                        key={toast.id}
                        onPress={() => dismissToast(toast.id)}
                        role={isError ? 'alert' : 'status'}
                        aria-live={isError ? 'assertive' : 'polite'}
                        aria-label={[toast.title, toast.message].filter(Boolean).join('. ')}
                        accessibilityHint="Tap to dismiss"
                        style={[
                            styles.toast,
                            {
                                backgroundColor: theme.colors.surfaceElevated,
                                borderColor: isError ? theme.colors.error : theme.colors.border,
                            },
                        ]}
                    >
                        <View style={[styles.toastAccent, { backgroundColor: isError ? theme.colors.error : theme.primary[500] }]} />
                        <View style={styles.toastBody}>
                            {!!toast.title && (
                                <Text style={[styles.toastTitle, { color: theme.colors.text.primary }]}>{toast.title}</Text>
                            )}
                            {!!toast.message && (
                                <Text style={[styles.toastMessage, { color: theme.colors.text.secondary }]}>{toast.message}</Text>
                            )}
                        </View>
                        <Text style={[styles.toastClose, { color: theme.colors.text.tertiary }]} aria-hidden>
                            ✕
                        </Text>
                    </Pressable>
                );
            })}
        </View>,
        document.body
    );
}

function Dialog({ dialog, theme }) {
    const initialFocusRef = useRef(null);
    useEffect(() => {
        const t = setTimeout(() => initialFocusRef.current?.focus?.(), 0);
        return () => clearTimeout(t);
    }, [dialog.id]);

    const cancelButton = dialog.buttons.find((b) => b.style === 'cancel');
    // Escape and a tap outside always close the dialog; with a Cancel button
    // that counts as Cancel, otherwise nothing is chosen (like Android's back).
    const dismiss = () => closeDialog(cancelButton || null);
    const stacked = dialog.buttons.length > 2;
    const focusIndex = cancelButton ? dialog.buttons.indexOf(cancelButton) : dialog.buttons.length - 1;
    const titleId = `alert-title-${dialog.id}`;
    const messageId = `alert-message-${dialog.id}`;

    return (
        <Modal
            transparent
            visible
            // react-native-web only arms Escape and the focus trap once the open
            // animation reports animationend, which doesn't reliably fire here.
            animationType="none"
            onRequestClose={dismiss}
            aria-labelledby={dialog.title ? titleId : undefined}
            aria-describedby={dialog.message ? messageId : undefined}
        >
            <View style={styles.dialogRoot}>
                {/* A plain View: the focus trap focuses anything focusable when Tab
                    wraps, including a Pressable with tabIndex -1. */}
                <View
                    style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay }]}
                    onClick={dismiss}
                    aria-hidden
                />
                <View
                    style={[styles.card, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}
                >
                    {!!dialog.title && (
                        <Text
                            nativeID={titleId}
                            role="heading"
                            style={[styles.title, { color: theme.colors.text.primary, fontFamily: theme.typography.fonts.display }]}
                        >
                            {dialog.title}
                        </Text>
                    )}
                    {!!dialog.message && (
                        <Text nativeID={messageId} style={[styles.message, { color: theme.colors.text.secondary }]}>
                            {dialog.message}
                        </Text>
                    )}
                    <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
                        {dialog.buttons.map((button, index) => {
                            const isCancel = button.style === 'cancel';
                            const isDestructive = button.style === 'destructive';
                            const isPrimary = !isCancel && !isDestructive && index === dialog.buttons.length - 1;
                            const background = isDestructive
                                ? theme.colors.error
                                : isPrimary
                                    ? theme.primary[500]
                                    : theme.colors.surfaceMuted;
                            const color = isDestructive || isPrimary ? '#FFFFFF' : theme.colors.text.primary;
                            return (
                                <Pressable
                                    key={`${button.text}-${index}`}
                                    ref={index === focusIndex ? initialFocusRef : undefined}
                                    onPress={() => closeDialog(button)}
                                    style={({ hovered, focused }) => [
                                        styles.button,
                                        !stacked && styles.buttonInline,
                                        { backgroundColor: background, opacity: hovered ? 0.88 : 1 },
                                        focused && { outlineStyle: 'solid', outlineWidth: 2, outlineColor: theme.primary[500], outlineOffset: 2 },
                                    ]}
                                    role="button"
                                >
                                    <Text style={[styles.buttonText, { color }]}>{button.text || 'OK'}</Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

export function AlertHost() {
    const { toast, dialog } = useAlertState();
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    return (
        <>
            <Toasts items={toast} theme={theme} />
            {dialog && <Dialog key={dialog.id} dialog={dialog} theme={theme} />}
        </>
    );
}

const styles = StyleSheet.create({
    toastLayer: {
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 96,
        alignItems: 'center',
        paddingHorizontal: 16,
        gap: 8,
        zIndex: 10000,
    },
    toast: {
        width: '100%',
        maxWidth: 440,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        borderWidth: 1,
        borderRadius: 16,
        paddingVertical: 12,
        paddingRight: 14,
        overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
    },
    toastAccent: {
        width: 4,
        alignSelf: 'stretch',
    },
    toastBody: {
        flex: 1,
        gap: 2,
    },
    toastTitle: {
        fontSize: 15,
        fontWeight: '700',
    },
    toastMessage: {
        fontSize: 14,
        lineHeight: 20,
    },
    toastClose: {
        fontSize: 14,
        paddingTop: 2,
    },
    dialogRoot: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    card: {
        width: '100%',
        maxWidth: 380,
        borderRadius: 20,
        borderWidth: 1,
        padding: 22,
    },
    title: {
        fontSize: 20,
        marginBottom: 8,
    },
    message: {
        fontSize: 15,
        lineHeight: 22,
    },
    buttons: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 20,
    },
    buttonsStacked: {
        flexDirection: 'column-reverse',
    },
    button: {
        minHeight: 44,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonInline: {
        flex: 1,
    },
    buttonText: {
        fontSize: 15,
        fontWeight: '700',
    },
});
