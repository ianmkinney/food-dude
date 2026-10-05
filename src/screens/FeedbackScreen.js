import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import ElevatedCard from '../components/ElevatedCard';
import AnimatedPressable from '../components/AnimatedPressable';
import {
    FEEDBACK_CATEGORIES,
    FEEDBACK_CONTEXT_DISCLOSURE,
    FEEDBACK_LIMITS,
    FEEDBACK_PRIVACY_NOTE,
    FEEDBACK_REPO,
} from '../constants/feedback';
import {
    buildReport,
    collectDeviceContext,
    handOffReport,
    listSubmissions,
    validateReport,
} from '../services/feedbackService';

const FeedbackScreen = ({ navigation, route }) => {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const fromScreen = route?.params?.fromScreen || 'Account';

    const [step, setStep] = useState('describe');
    const [category, setCategory] = useState(FEEDBACK_CATEGORIES[0].id);
    const [problem, setProblem] = useState('');
    const [expected, setExpected] = useState('');
    const [steps, setSteps] = useState('');
    const [screenshot, setScreenshot] = useState(null);
    const [includeContext, setIncludeContext] = useState(true);
    const [context, setContext] = useState(null);
    const [report, setReport] = useState(null);
    const [sending, setSending] = useState(false);
    const [handoff, setHandoff] = useState(null);
    const [history, setHistory] = useState([]);

    useEffect(() => {
        collectDeviceContext({ screen: fromScreen }).then(setContext);
        listSubmissions().then(setHistory);
    }, [fromScreen]);

    const effectiveContext = useMemo(() => {
        const base = context || {
            appVersion: 'unknown',
            platform: Platform.OS,
            platformVersion: 'unknown',
            screen: fromScreen,
            aiProvider: 'none',
            aiKeySaved: false,
        };
        if (includeContext) return base;
        return {
            ...base,
            platformVersion: 'not shared',
            screen: 'not shared',
            aiProvider: 'not shared',
            aiKeySaved: false,
        };
    }, [context, includeContext, fromScreen]);

    const handlePickScreenshot = useCallback(async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                quality: 0.6,
                base64: true,
            });
            if (result.canceled || !result.assets?.length) return;
            const asset = result.assets[0];
            setScreenshot({ uri: asset.uri, base64: asset.base64 || null });
        } catch (error) {
            Alert.alert('Could not open photos', error?.message || 'Try again, or send the report without a screenshot.');
        }
    }, []);

    const handleReview = useCallback(() => {
        const check = validateReport({ problem });
        if (!check.ok) {
            Alert.alert('Almost there', check.message);
            return;
        }
        setReport(
            buildReport({
                category,
                problem,
                expected,
                steps,
                context: effectiveContext,
                appearance: isDark ? 'dark' : 'light',
                hasScreenshot: Boolean(screenshot),
            })
        );
        setStep('review');
    }, [category, problem, expected, steps, effectiveContext, isDark, screenshot]);

    const handleSend = useCallback(async () => {
        if (!report) return;
        setSending(true);
        try {
            const result = await handOffReport(report);
            setHandoff(result);
            setHistory(await listSubmissions());
            setStep('sent');
        } catch (error) {
            Alert.alert('Could not open GitHub', error?.message || 'Copy the report instead and paste it into a new issue.');
        } finally {
            setSending(false);
        }
    }, [report]);

    const handleCopyReport = useCallback(async () => {
        if (!report) return;
        await Clipboard.setStringAsync(`${report.title}\n\n${report.body}`);
        Alert.alert('Copied', 'The report is on your clipboard. Paste it into a new GitHub issue.');
    }, [report]);

    const handleCopyScreenshot = useCallback(async () => {
        if (!screenshot?.base64) {
            Alert.alert('Nothing to copy', 'Pick a screenshot first.');
            return;
        }
        try {
            await Clipboard.setImageAsync(screenshot.base64);
            Alert.alert('Screenshot copied', 'Paste it into the GitHub issue comment box.');
        } catch {
            Alert.alert(
                'Copy not supported here',
                'Attach the screenshot from your photo library on the GitHub page instead.'
            );
        }
    }, [screenshot]);

    const handleStartOver = useCallback(() => {
        setStep('describe');
        setProblem('');
        setExpected('');
        setSteps('');
        setScreenshot(null);
        setReport(null);
        setHandoff(null);
    }, []);

    const renderDescribe = () => (
        <>
            <ElevatedCard theme={theme} variant="glass" style={styles.card} index={0}>
                <View style={styles.cardHeader}>
                    <Ionicons name="megaphone-outline" size={22} color={theme.primary[500]} />
                    <Text style={[styles.cardTitle, { color: theme.colors.text.primary }]}>
                        What's wrong?
                    </Text>
                </View>
                <Text style={[styles.help, { color: theme.colors.text.secondary }]}>
                    Describe it the way you would to a friend. Your report becomes a GitHub issue you
                    submit yourself, and a coding agent turns it into a pull request with a demo video.
                </Text>

                <View style={styles.chipRow}>
                    {FEEDBACK_CATEGORIES.map((item) => {
                        const selected = item.id === category;
                        return (
                            <AnimatedPressable
                                key={item.id}
                                onPress={() => setCategory(item.id)}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                style={[
                                    styles.chip,
                                    {
                                        backgroundColor: selected ? theme.primary[500] : theme.colors.surface,
                                        borderColor: selected ? theme.primary[500] : theme.colors.border,
                                    },
                                ]}
                            >
                                <Ionicons
                                    name={item.icon}
                                    size={16}
                                    color={selected ? '#FFFFFF' : theme.colors.text.secondary}
                                />
                                <Text
                                    style={[
                                        styles.chipText,
                                        { color: selected ? '#FFFFFF' : theme.colors.text.primary },
                                    ]}
                                >
                                    {item.label}
                                </Text>
                            </AnimatedPressable>
                        );
                    })}
                </View>

                <Text style={[styles.label, { color: theme.colors.text.secondary }]}>
                    What happened
                </Text>
                <TextInput
                    style={[
                        styles.input,
                        styles.textArea,
                        { color: theme.colors.text.primary, borderColor: theme.colors.border },
                    ]}
                    placeholder="The pantry list went blank after I scanned a barcode…"
                    placeholderTextColor={theme.colors.text.tertiary}
                    value={problem}
                    onChangeText={setProblem}
                    maxLength={FEEDBACK_LIMITS.problem}
                    multiline
                    numberOfLines={5}
                    accessibilityLabel="What happened"
                />
                <Text style={[styles.counter, { color: theme.colors.text.tertiary }]}>
                    {problem.length}/{FEEDBACK_LIMITS.problem}
                </Text>

                <Text style={[styles.label, { color: theme.colors.text.secondary }]}>
                    What you expected (optional)
                </Text>
                <TextInput
                    style={[
                        styles.input,
                        styles.textAreaShort,
                        { color: theme.colors.text.primary, borderColor: theme.colors.border },
                    ]}
                    placeholder="The scanned item should land in the pantry list."
                    placeholderTextColor={theme.colors.text.tertiary}
                    value={expected}
                    onChangeText={setExpected}
                    maxLength={FEEDBACK_LIMITS.expected}
                    multiline
                    accessibilityLabel="What you expected"
                />

                <Text style={[styles.label, { color: theme.colors.text.secondary }]}>
                    Steps you took (optional)
                </Text>
                <TextInput
                    style={[
                        styles.input,
                        styles.textAreaShort,
                        { color: theme.colors.text.primary, borderColor: theme.colors.border },
                    ]}
                    placeholder={'1. Open Pantry\n2. Tap scan\n3. Point at a soup can'}
                    placeholderTextColor={theme.colors.text.tertiary}
                    value={steps}
                    onChangeText={setSteps}
                    maxLength={FEEDBACK_LIMITS.steps}
                    multiline
                    accessibilityLabel="Steps you took"
                />
            </ElevatedCard>

            <ElevatedCard theme={theme} variant="card" style={styles.card} index={1}>
                <View style={styles.cardHeader}>
                    <Ionicons name="image-outline" size={22} color={theme.primary[500]} />
                    <Text style={[styles.cardTitle, { color: theme.colors.text.primary }]}>
                        Screenshot (optional)
                    </Text>
                </View>
                <Text style={[styles.help, { color: theme.colors.text.secondary }]}>
                    A picture of the problem makes it much easier to reproduce. GitHub can't take the
                    image through the link, so pick it here and paste it into the issue.
                </Text>
                {screenshot ? (
                    <View style={styles.shotRow}>
                        <Image source={{ uri: screenshot.uri }} style={styles.shotThumb} />
                        <View style={styles.shotActions}>
                            <AnimatedPressable
                                onPress={handleCopyScreenshot}
                                style={[styles.smallButton, { backgroundColor: theme.primary[500] }]}
                            >
                                <Ionicons name="copy-outline" size={16} color="#FFFFFF" />
                                <Text style={styles.smallButtonText}>Copy image</Text>
                            </AnimatedPressable>
                            <AnimatedPressable
                                onPress={() => setScreenshot(null)}
                                style={[styles.smallButton, styles.ghostButton, { borderColor: theme.colors.border }]}
                            >
                                <Ionicons name="trash-outline" size={16} color={theme.colors.text.secondary} />
                                <Text style={[styles.smallButtonText, { color: theme.colors.text.primary }]}>
                                    Remove
                                </Text>
                            </AnimatedPressable>
                        </View>
                    </View>
                ) : (
                    <AnimatedPressable
                        onPress={handlePickScreenshot}
                        style={[styles.pickerButton, { borderColor: theme.colors.border }]}
                    >
                        <Ionicons name="add-circle-outline" size={20} color={theme.primary[500]} />
                        <Text style={[styles.pickerButtonText, { color: theme.colors.text.primary }]}>
                            Attach a screenshot
                        </Text>
                    </AnimatedPressable>
                )}
            </ElevatedCard>

            <ElevatedCard theme={theme} variant="card" style={styles.card} index={2}>
                <AnimatedPressable
                    onPress={() => setIncludeContext((prev) => !prev)}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: includeContext }}
                    style={styles.toggleRow}
                >
                    <Ionicons
                        name={includeContext ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={includeContext ? theme.primary[500] : theme.colors.text.tertiary}
                    />
                    <Text style={[styles.toggleText, { color: theme.colors.text.primary }]}>
                        Include technical context
                    </Text>
                </AnimatedPressable>
                {FEEDBACK_CONTEXT_DISCLOSURE.map((line) => (
                    <Text key={line} style={[styles.bullet, { color: theme.colors.text.secondary }]}>
                        •  {line}
                    </Text>
                ))}
                <Text style={[styles.privacy, { color: theme.colors.text.tertiary }]}>
                    {FEEDBACK_PRIVACY_NOTE}
                </Text>
            </ElevatedCard>

            <AnimatedPressable
                onPress={handleReview}
                style={[styles.primaryButton, { backgroundColor: theme.primary[500] }, theme.shadows.glow]}
            >
                <Text style={styles.primaryButtonText}>Review report</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </AnimatedPressable>

            {history.length ? (
                <ElevatedCard theme={theme} variant="muted" style={styles.card} index={3}>
                    <Text style={[styles.cardTitle, { color: theme.colors.text.primary }]}>
                        Your recent reports
                    </Text>
                    {history.slice(0, 3).map((entry) => (
                        <AnimatedPressable
                            key={entry.id}
                            onPress={() => Linking.openURL(entry.url)}
                            style={styles.historyRow}
                        >
                            <Ionicons name="open-outline" size={16} color={theme.primary[500]} />
                            <Text
                                style={[styles.historyText, { color: theme.colors.text.secondary }]}
                                numberOfLines={1}
                            >
                                {entry.title}
                            </Text>
                        </AnimatedPressable>
                    ))}
                </ElevatedCard>
            ) : null}
        </>
    );

    const renderReview = () => (
        <>
            <ElevatedCard theme={theme} variant="glass" style={styles.card} index={0}>
                <View style={styles.cardHeader}>
                    <Ionicons name="document-text-outline" size={22} color={theme.primary[500]} />
                    <Text style={[styles.cardTitle, { color: theme.colors.text.primary }]}>
                        This is exactly what gets sent
                    </Text>
                </View>
                <Text style={[styles.help, { color: theme.colors.text.secondary }]}>
                    Nothing has left your device yet. Submit opens a prefilled issue on
                    github.com/{FEEDBACK_REPO} in your browser — you press Submit there.
                </Text>
                <View style={[styles.preview, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }]}>
                    <Text style={[styles.previewTitle, { color: theme.colors.text.primary }]}>
                        {report?.title}
                    </Text>
                    <Text style={[styles.previewBody, { color: theme.colors.text.secondary }]}>
                        {report?.body}
                    </Text>
                </View>
            </ElevatedCard>

            <AnimatedPressable
                onPress={handleSend}
                disabled={sending}
                style={[styles.primaryButton, { backgroundColor: theme.primary[500] }, theme.shadows.glow]}
            >
                {sending ? (
                    <ActivityIndicator color="#FFFFFF" />
                ) : (
                    <>
                        <Ionicons name="logo-github" size={18} color="#FFFFFF" />
                        <Text style={styles.primaryButtonText}>Open prefilled GitHub issue</Text>
                    </>
                )}
            </AnimatedPressable>

            <View style={styles.secondaryRow}>
                <AnimatedPressable
                    onPress={() => setStep('describe')}
                    style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
                >
                    <Text style={[styles.secondaryButtonText, { color: theme.colors.text.primary }]}>
                        Back to edit
                    </Text>
                </AnimatedPressable>
                <AnimatedPressable
                    onPress={handleCopyReport}
                    style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
                >
                    <Text style={[styles.secondaryButtonText, { color: theme.colors.text.primary }]}>
                        Copy report
                    </Text>
                </AnimatedPressable>
            </View>
        </>
    );

    const renderSent = () => (
        <>
            <ElevatedCard theme={theme} variant="glass" style={styles.card} index={0}>
                <View style={styles.cardHeader}>
                    <Ionicons name="checkmark-circle" size={24} color={theme.colors.success} />
                    <Text style={[styles.cardTitle, { color: theme.colors.text.primary }]}>
                        Report ready on GitHub
                    </Text>
                </View>
                <Text style={[styles.help, { color: theme.colors.text.secondary }]}>
                    Finish it off in the browser tab that just opened:
                </Text>
                {[
                    'Press Submit new issue — the report is already filled in.',
                    screenshot
                        ? 'Paste your screenshot into the issue or a first comment.'
                        : 'Add a screenshot in a comment if you have one.',
                    'A Cursor cloud agent picks it up and opens a draft pull request.',
                    'You review that PR and watch the demo video before merging.',
                ].map((line, position) => (
                    <View key={line} style={styles.stepRow}>
                        <View style={[styles.stepBadge, { backgroundColor: theme.primary[100] }]}>
                            <Text style={[styles.stepBadgeText, { color: theme.primary[700] }]}>
                                {position + 1}
                            </Text>
                        </View>
                        <Text style={[styles.stepText, { color: theme.colors.text.secondary }]}>{line}</Text>
                    </View>
                ))}
                {handoff?.url ? (
                    <AnimatedPressable
                        onPress={() => Linking.openURL(handoff.url)}
                        style={[styles.smallButton, { backgroundColor: theme.primary[500], alignSelf: 'flex-start', marginTop: 12 }]}
                    >
                        <Ionicons name="open-outline" size={16} color="#FFFFFF" />
                        <Text style={styles.smallButtonText}>Reopen the issue page</Text>
                    </AnimatedPressable>
                ) : null}
            </ElevatedCard>

            <View style={styles.secondaryRow}>
                <AnimatedPressable
                    onPress={handleStartOver}
                    style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
                >
                    <Text style={[styles.secondaryButtonText, { color: theme.colors.text.primary }]}>
                        Send another
                    </Text>
                </AnimatedPressable>
                <AnimatedPressable
                    onPress={() => navigation.goBack()}
                    style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
                >
                    <Text style={[styles.secondaryButtonText, { color: theme.colors.text.primary }]}>
                        Done
                    </Text>
                </AnimatedPressable>
            </View>
        </>
    );

    return (
        <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView
                style={[styles.container, { backgroundColor: theme.colors.background }]}
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
            >
                {step === 'describe' ? renderDescribe() : null}
                {step === 'review' ? renderReview() : null}
                {step === 'sent' ? renderSent() : null}
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    flex: {
        flex: 1,
    },
    container: {
        flex: 1,
    },
    content: {
        padding: 16,
        paddingBottom: 48,
        gap: 12,
        // A form is easier to read as a column than stretched across a desktop
        // browser. No effect at phone widths.
        width: '100%',
        maxWidth: 720,
        alignSelf: 'center',
    },
    card: {
        padding: 20,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
    },
    cardTitle: {
        flex: 1,
        fontSize: 17,
        fontWeight: '700',
    },
    help: {
        fontSize: 13,
        lineHeight: 19,
        marginBottom: 12,
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 22,
        borderWidth: 1,
    },
    chipText: {
        fontSize: 13,
        fontWeight: '600',
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    input: {
        borderWidth: 1,
        borderRadius: 14,
        padding: 12,
        fontSize: 15,
        marginBottom: 12,
    },
    textArea: {
        minHeight: 110,
        textAlignVertical: 'top',
        marginBottom: 2,
    },
    textAreaShort: {
        minHeight: 70,
        textAlignVertical: 'top',
    },
    counter: {
        fontSize: 11,
        textAlign: 'right',
        marginBottom: 14,
    },
    shotRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    shotThumb: {
        width: 72,
        height: 72,
        borderRadius: 12,
    },
    shotActions: {
        flex: 1,
        gap: 8,
    },
    pickerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderRadius: 14,
        paddingVertical: 16,
    },
    pickerButtonText: {
        fontSize: 15,
        fontWeight: '600',
    },
    smallButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 12,
    },
    smallButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '600',
    },
    ghostButton: {
        backgroundColor: 'transparent',
        borderWidth: 1,
    },
    toggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 10,
    },
    toggleText: {
        flex: 1,
        fontSize: 15,
        fontWeight: '600',
    },
    bullet: {
        fontSize: 12,
        lineHeight: 18,
    },
    privacy: {
        fontSize: 12,
        lineHeight: 17,
        marginTop: 10,
    },
    primaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 16,
        borderRadius: 16,
        minHeight: 54,
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
    secondaryRow: {
        flexDirection: 'row',
        gap: 12,
    },
    secondaryButton: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 16,
        borderWidth: 1,
    },
    secondaryButtonText: {
        fontSize: 15,
        fontWeight: '600',
    },
    preview: {
        borderWidth: 1,
        borderRadius: 14,
        padding: 14,
    },
    previewTitle: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 10,
    },
    previewBody: {
        fontSize: 13,
        lineHeight: 19,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    stepRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 10,
    },
    stepBadge: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stepBadgeText: {
        fontSize: 12,
        fontWeight: '700',
    },
    stepText: {
        flex: 1,
        fontSize: 13,
        lineHeight: 19,
    },
    historyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
    },
    historyText: {
        flex: 1,
        fontSize: 13,
    },
});

export default FeedbackScreen;
