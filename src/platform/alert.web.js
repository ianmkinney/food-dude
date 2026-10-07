import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';

// react-native-web ships `Alert.alert` as a no-op, which silently swallows every
// confirmation, error and "what next?" dialog in the app. This replaces it with
// a queue rendered by <AlertHost />, keeping the native call signature.
const queue = [];
let notify = null;

export function installAlertPolyfill() {
    Alert.alert = (title, message, buttons, options) => {
        queue.push({
            title: title == null ? '' : String(title),
            message: message == null ? '' : String(message),
            buttons: Array.isArray(buttons) && buttons.length ? buttons : [{ text: 'OK' }],
            cancelable: options?.cancelable ?? false,
            onDismiss: options?.onDismiss,
        });
        notify?.();
    };
}

export function AlertHost() {
    const [current, setCurrent] = useState(null);
    const { isDark } = useTheme();
    const theme = getTheme(isDark);

    useEffect(() => {
        notify = () => setCurrent((prev) => prev || queue.shift() || null);
        notify();
        return () => {
            notify = null;
        };
    }, []);

    const close = (button) => {
        setCurrent(queue.shift() || null);
        button?.onPress?.();
    };

    if (!current) return null;

    const cancelButton = current.buttons.find((b) => b.style === 'cancel');
    const dismiss = () => {
        if (cancelButton) {
            close(cancelButton);
        } else if (current.cancelable) {
            setCurrent(queue.shift() || null);
            current.onDismiss?.();
        }
    };

    const stacked = current.buttons.length > 2;

    return (
        <Modal transparent visible animationType="fade" onRequestClose={dismiss}>
            <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={dismiss}>
                <Pressable
                    style={[
                        styles.card,
                        { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border },
                    ]}
                    accessibilityRole="alert"
                    onPress={() => {}}
                >
                    {!!current.title && (
                        <Text style={[styles.title, { color: theme.colors.text.primary, fontFamily: theme.typography.fonts.display }]}>
                            {current.title}
                        </Text>
                    )}
                    {!!current.message && (
                        <Text style={[styles.message, { color: theme.colors.text.secondary }]}>{current.message}</Text>
                    )}
                    <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
                        {current.buttons.map((button, index) => {
                            const isCancel = button.style === 'cancel';
                            const isDestructive = button.style === 'destructive';
                            const isPrimary = !isCancel && !isDestructive && index === current.buttons.length - 1;
                            const background = isDestructive
                                ? theme.colors.error
                                : isPrimary
                                    ? theme.primary[500]
                                    : theme.colors.surfaceMuted;
                            const color = isDestructive || isPrimary ? '#FFFFFF' : theme.colors.text.primary;
                            return (
                                <Pressable
                                    key={`${button.text}-${index}`}
                                    onPress={() => close(button)}
                                    style={({ hovered }) => [
                                        styles.button,
                                        !stacked && styles.buttonInline,
                                        { backgroundColor: background, opacity: hovered ? 0.88 : 1 },
                                    ]}
                                    accessibilityRole="button"
                                >
                                    <Text style={[styles.buttonText, { color }]}>{button.text || 'OK'}</Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
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
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 999,
        alignItems: 'center',
    },
    buttonInline: {
        flex: 1,
    },
    buttonText: {
        fontSize: 15,
        fontWeight: '700',
    },
});
