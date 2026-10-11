import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getTheme } from '../theme';

type Props = {
    children: ReactNode;
    onGoBack?: () => void;
    isDark?: boolean;
};

type State = { error: Error | null; componentStack: string; detailsOpen: boolean };

/** Catches render errors so one broken screen does not white-screen the whole app. */
export default class ScreenErrorBoundary extends Component<Props, State> {
    state: State = { error: null, componentStack: '', detailsOpen: false };

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { error, detailsOpen: false };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[ScreenErrorBoundary]', error.message, error.stack, info.componentStack);
        this.setState({ componentStack: info.componentStack || '' });
    }

    private reset = () => this.setState({ error: null, componentStack: '', detailsOpen: false });

    private toggleDetails = () => this.setState((s) => ({ detailsOpen: !s.detailsOpen }));

    render() {
        if (!this.state.error) {
            return this.props.children;
        }

        const theme = getTheme(this.props.isDark ?? false);
        const c = theme.colors;
        const { error, componentStack, detailsOpen } = this.state;
        const detailText = [error.message, error.stack, componentStack].filter(Boolean).join('\n\n');

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
                    accessibilityState={{ expanded: detailsOpen }}
                    onPress={this.toggleDetails}
                    style={[styles.detailsToggle, { borderColor: c.border }]}
                >
                    <Text style={[styles.detailsToggleText, { color: c.text.secondary }]}>
                        {detailsOpen ? 'Hide details' : 'Details'}
                    </Text>
                </Pressable>
                {detailsOpen ? (
                    <View style={[styles.detailsBox, { backgroundColor: c.surface, borderColor: c.border }]}>
                        <Text selectable style={[styles.detailsText, { color: c.text.primary }]}>
                            {detailText || 'No additional details.'}
                        </Text>
                    </View>
                ) : null}
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
    detailsToggle: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
    },
    detailsToggleText: { fontSize: 14, fontWeight: '600' },
    detailsBox: {
        width: '100%',
        maxHeight: 220,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        padding: 12,
        overflow: 'scroll',
    },
    detailsText: {
        fontSize: 12,
        lineHeight: 18,
        fontFamily: 'monospace',
    },
    button: {
        marginTop: 8,
        paddingVertical: 14,
        paddingHorizontal: 28,
        borderRadius: 12,
    },
    buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
