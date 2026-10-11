import React, { useEffect, useId, useRef } from 'react';
import {
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';

type Props = {
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    destructive?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    children?: React.ReactNode;
    contentStyle?: StyleProp<ViewStyle>;
};

/** Accessible confirm dialog (works on web where Alert.alert is a no-op). */
export default function AccessibleConfirmModal({
    visible,
    title,
    message,
    confirmLabel,
    cancelLabel = 'Cancel',
    destructive,
    onConfirm,
    onCancel,
    children,
    contentStyle,
}: Props) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const c = theme.colors;
    const titleId = useId();
    const messageId = useId();
    const cancelRef = useRef<View>(null);

    useEffect(() => {
        if (!visible) return;
        const t = setTimeout(() => {
            cancelRef.current?.focus?.();
        }, 50);
        return () => clearTimeout(t);
    }, [visible]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onCancel}
            accessibilityViewIsModal
        >
            <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="Dismiss dialog">
                <Pressable
                    style={[styles.card, { backgroundColor: c.surfaceElevated }, contentStyle]}
                    onPress={(e) => e.stopPropagation()}
                    accessibilityRole="none"
                >
                    <Text nativeID={titleId} style={[styles.title, { color: c.text.primary }]} accessibilityRole="header">
                        {title}
                    </Text>
                    <Text nativeID={messageId} style={[styles.message, { color: c.text.secondary }]}>
                        {message}
                    </Text>
                    {children}
                    <View style={styles.actions}>
                        <Pressable
                            ref={cancelRef}
                            onPress={onCancel}
                            style={styles.btn}
                            accessibilityRole="button"
                            accessibilityLabel={cancelLabel}
                        >
                            <Text style={[styles.cancelText, { color: c.text.primary }]}>{cancelLabel}</Text>
                        </Pressable>
                        <Pressable
                            onPress={onConfirm}
                            style={[styles.btn, destructive && styles.destructiveBtn]}
                            accessibilityRole="button"
                            accessibilityLabel={confirmLabel}
                        >
                            <Text style={[styles.confirmText, destructive && styles.destructiveText]}>{confirmLabel}</Text>
                        </Pressable>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    card: {
        width: '100%',
        maxWidth: 400,
        borderRadius: 16,
        padding: 20,
        backgroundColor: '#fff',
        gap: 12,
    },
    title: { fontSize: 18, fontWeight: '700' },
    message: { fontSize: 15, lineHeight: 22, color: '#444' },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
    btn: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 10 },
    cancelText: { fontSize: 16, fontWeight: '600' },
    confirmText: { fontSize: 16, fontWeight: '700', color: '#0a7ea4' },
    destructiveBtn: { backgroundColor: 'rgba(220,38,38,0.12)' },
    destructiveText: { color: '#dc2626' },
});
