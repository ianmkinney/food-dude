import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getTheme } from '../theme';

type Props = {
    children: ReactNode;
    label?: string;
    isDark?: boolean;
};

type State = { error: Error | null };

/** Isolates a single recipe section so bad data cannot crash the whole screen. */
export default class SectionErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.warn('[SectionErrorBoundary]', this.props.label || 'section', error.message, info.componentStack);
    }

    render() {
        if (!this.state.error) {
            return this.props.children;
        }
        const theme = getTheme(this.props.isDark ?? false);
        return (
            <View style={[styles.box, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <Text style={[styles.text, { color: theme.colors.text.secondary }]}>
                    This section couldn&apos;t load
                </Text>
            </View>
        );
    }
}

const styles = StyleSheet.create({
    box: {
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        padding: 14,
        marginVertical: 6,
    },
    text: { fontSize: 14, textAlign: 'center' },
});
