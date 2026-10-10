import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getTheme } from '../theme';

type Props = {
    children: ReactNode;
    onGoBack?: () => void;
    isDark?: boolean;
};

type State = { error: Error | null };

/** Catches render errors so one broken screen does not white-screen the whole app. */
export default class ScreenErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[ScreenErrorBoundary]', error, info.componentStack);
    }

    private reset = () => this.setState({ error: null });

    render() {
        if (!this.state.error) {
            return this.props.children;
        }

        const theme = getTheme(this.props.isDark ?? false);
        const c = theme.colors;

        return (
            <View style={[styles.root, { backgroundColor: c.background }]}>
                <Text style={[styles.title, { color: c.text.primary, fontFamily: theme.typography.fonts.display }]}>
                    Something went wrong
                </Text>
                <Text style={[styles.body, { color: c.text.secondary }]}>
                    This screen hit an unexpected error. You can go back and try again.
                </Text>
                <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                        this.reset();
                        this.props.onGoBack?.();
                    }}
                    style={[styles.button, { backgroundColor: theme.primary[500] }]}
                >
                    <Text style={styles.buttonText}>Go back</Text>
                </Pressable>
            </View>
        );
    }
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        padding: 28,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 14,
        maxWidth: 480,
        width: '100%',
        alignSelf: 'center',
    },
    title: { fontSize: 24, textAlign: 'center' },
    body: { fontSize: 16, lineHeight: 24, textAlign: 'center' },
    button: {
        marginTop: 8,
        paddingVertical: 14,
        paddingHorizontal: 28,
        borderRadius: 12,
    },
    buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
