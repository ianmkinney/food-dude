import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
    PROVIDERS,
    DEFAULT_MODELS,
    clearApiKey,
    getAccountAiState,
    saveApiKey,
    setSelectedModel,
    setSelectedProvider,
} from '../services/aiSettings';
import { fallbackModels, listProviderModels } from '../services/aiClient';

const AiProviderSettings = ({ theme }) => {
    const [provider, setProvider] = useState(PROVIDERS[0].id);
    const [hasKey, setHasKey] = useState(false);
    const [keyLast4, setKeyLast4] = useState('');
    const [keyDraft, setKeyDraft] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [model, setModel] = useState(DEFAULT_MODELS[PROVIDERS[0].id]);
    const [models, setModels] = useState([]);
    const [modelsError, setModelsError] = useState('');
    const [modelsFromCache, setModelsFromCache] = useState(false);
    const [loadingState, setLoadingState] = useState(true);
    const [saving, setSaving] = useState(false);
    const [listing, setListing] = useState(false);
    const [status, setStatus] = useState('');

    const applyState = useCallback((state) => {
        setProvider(state.provider);
        setHasKey(state.hasKey);
        setKeyLast4(state.keyLast4);
        setModel(state.model);
        setModels(state.cachedModels || []);
        setModelsFromCache(Boolean(state.cachedModels?.length));
    }, []);

    const load = useCallback(async () => {
        try {
            const state = await getAccountAiState();
            applyState(state);
            setModelsError('');
            if (state.hasKey && !state.cachedModels?.length) {
                refreshModels(state.provider, { force: false, currentModel: state.model });
            }
        } catch (error) {
            setStatus(error.message || 'Could not load AI settings');
        } finally {
            setLoadingState(false);
        }
    }, [applyState]);

    useEffect(() => {
        load();
    }, [load]);

    const refreshModels = async (providerId, { force = true, currentModel } = {}) => {
        setListing(true);
        setModelsError('');
        try {
            const result = await listProviderModels({ provider: providerId, force });
            setModels(result.models);
            setModelsFromCache(result.fromCache);
            const selected = currentModel || model;
            const stillValid = result.models.some((item) => item.id === selected);
            if (!stillValid && result.models[0]) {
                await setSelectedModel(providerId, result.models[0].id);
                setModel(result.models[0].id);
            }
            setStatus(result.fromCache ? 'Showing cached models' : 'Loaded models from provider');
        } catch (error) {
            const fallback = fallbackModels(providerId);
            setModels(fallback);
            setModelsFromCache(false);
            setModelsError(error.message || 'Could not list models');
            const fallbackId = fallback[0]?.id;
            if (fallbackId) {
                await setSelectedModel(providerId, fallbackId);
                setModel(fallbackId);
            }
        } finally {
            setListing(false);
        }
    };

    const handleSelectProvider = async (providerId) => {
        if (providerId === provider) return;
        setProvider(providerId);
        setKeyDraft('');
        setShowKey(false);
        setStatus('');
        setModelsError('');
        try {
            await setSelectedProvider(providerId);
            const state = await getAccountAiState();
            applyState(state);
        } catch (error) {
            setStatus(error.message || 'Could not switch provider');
        }
    };

    const handleSaveKey = async () => {
        const trimmed = keyDraft.trim();
        if (!trimmed) {
            Alert.alert('API key required', 'Paste your provider key, then tap Save.');
            return;
        }
        setSaving(true);
        setStatus('');
        try {
            await saveApiKey(provider, trimmed);
            setKeyDraft('');
            setShowKey(false);
            setHasKey(true);
            setKeyLast4(`••••${trimmed.slice(-4)}`);
            await refreshModels(provider, { force: true, currentModel: model });
        } catch (error) {
            Alert.alert('Could not save key', error.message || 'Try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleClearKey = () => {
        Alert.alert(
            'Remove API key?',
            'This deletes the saved key for this provider from this device. Pantry, planner, and grocery still work without it.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await clearApiKey(provider);
                            setHasKey(false);
                            setKeyLast4('');
                            setKeyDraft('');
                            setModels([]);
                            setModelsError('');
                            setModel(DEFAULT_MODELS[provider]);
                            setStatus('Key removed from this device');
                        } catch (error) {
                            Alert.alert('Could not remove key', error.message || 'Try again.');
                        }
                    },
                },
            ]
        );
    };

    const handleSelectModel = async (modelId) => {
        try {
            await setSelectedModel(provider, modelId);
            setModel(modelId);
            setStatus(`Using ${modelId}`);
        } catch (error) {
            Alert.alert('Could not save model', error.message || 'Try again.');
        }
    };

    const handleRefreshPress = async () => {
        if (!hasKey) {
            const draft = keyDraft.trim();
            if (!draft) {
                Alert.alert('Add an API key first', 'Save a key for this provider, then refresh the model list.');
                return;
            }
            await handleSaveKey();
            return;
        }
        await refreshModels(provider, { force: true, currentModel: model });
    };

    const currentProvider = PROVIDERS.find((item) => item.id === provider) || PROVIDERS[0];
    const visibleModels = models.length ? models : fallbackModels(provider);

    return (
        <View style={styles.wrap}>
            <Text style={[styles.title, { color: theme.colors.text.primary }]}>AI provider</Text>
            <Text style={[styles.help, { color: theme.colors.text.secondary }]}>
                Your key stays on this device (Keychain / Keystore, or this browser). Food Dude never ships a shared key and does not send yours to our servers. Claude, OpenAI, and Grok live model lists work in Expo Go; the web app may fall back to defaults if the provider blocks browser calls.
            </Text>

            <View style={styles.providerGrid}>
                {PROVIDERS.map((item) => {
                    const selected = item.id === provider;
                    return (
                        <TouchableOpacity
                            key={item.id}
                            style={[
                                styles.providerChip,
                                {
                                    backgroundColor: selected ? theme.primary[500] : theme.colors.surface,
                                    borderColor: selected ? theme.primary[500] : theme.colors.border,
                                },
                            ]}
                            onPress={() => handleSelectProvider(item.id)}
                        >
                            <Text
                                style={[
                                    styles.providerChipText,
                                    { color: selected ? '#FFFFFF' : theme.colors.text.primary },
                                ]}
                            >
                                {item.shortLabel}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
            <Text style={[styles.providerFull, { color: theme.colors.text.secondary }]}>
                {currentProvider.label}
            </Text>

            <Text style={[styles.label, { color: theme.colors.text.secondary }]}>API key</Text>
            {hasKey ? (
                <Text style={[styles.keyStatus, { color: theme.colors.text.primary }]}>
                    Saved on this device {keyLast4}
                </Text>
            ) : (
                <Text style={[styles.keyStatus, { color: theme.colors.text.secondary }]}>
                    No key saved. AI Chef, import, and cost estimates stay off until you add one.
                </Text>
            )}

            <View
                style={[
                    styles.keyRow,
                    { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
                ]}
            >
                <TextInput
                    style={[styles.keyInput, { color: theme.colors.text.primary }]}
                    value={keyDraft}
                    onChangeText={setKeyDraft}
                    placeholder={hasKey ? 'Paste a new key to replace' : `Paste key (${currentProvider.hint})`}
                    placeholderTextColor={theme.colors.text.tertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    textContentType="password"
                    secureTextEntry={!showKey}
                />
                <TouchableOpacity
                    onPress={() => setShowKey((prev) => !prev)}
                    accessibilityLabel={showKey ? 'Hide API key' : 'Show API key'}
                    style={styles.iconButton}
                >
                    <Ionicons
                        name={showKey ? 'eye-off-outline' : 'eye-outline'}
                        size={22}
                        color={theme.colors.text.secondary}
                    />
                </TouchableOpacity>
            </View>

            <View style={styles.buttonRow}>
                <TouchableOpacity
                    style={[styles.button, { backgroundColor: theme.primary[500] }]}
                    onPress={handleSaveKey}
                    disabled={saving}
                >
                    {saving ? (
                        <ActivityIndicator color="#FFFFFF" />
                    ) : (
                        <Text style={styles.buttonText}>Save key</Text>
                    )}
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.button, styles.secondaryButton, { borderColor: theme.colors.border }]}
                    onPress={handleClearKey}
                    disabled={!hasKey}
                >
                    <Text style={[styles.secondaryButtonText, { color: theme.colors.text.primary }]}>
                        Clear
                    </Text>
                </TouchableOpacity>
            </View>

            <View style={styles.modelHeader}>
                <Text style={[styles.label, { color: theme.colors.text.secondary, marginBottom: 0 }]}>
                    Model
                </Text>
                <TouchableOpacity onPress={handleRefreshPress} disabled={listing} style={styles.refresh}>
                    {listing ? (
                        <ActivityIndicator size="small" color={theme.primary[500]} />
                    ) : (
                        <>
                            <Ionicons name="refresh" size={16} color={theme.primary[500]} />
                            <Text style={[styles.refreshText, { color: theme.primary[500] }]}>Refresh list</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
            <Text style={[styles.help, { color: theme.colors.text.secondary }]}>
                {hasKey
                    ? 'Choose from models your key can access. Raw model ids are shown.'
                    : 'Save a key to load the live model list. A cheap flash-class default is used if listing fails.'}
            </Text>

            {modelsError ? (
                <View style={[styles.errorBox, { borderColor: theme.colors.error || '#EF4444' }]}>
                    <Ionicons name="warning-outline" size={18} color={theme.colors.error || '#EF4444'} />
                    <Text style={[styles.errorText, { color: theme.colors.error || '#EF4444' }]}>
                        {modelsError} Using default {DEFAULT_MODELS[provider]}.
                    </Text>
                </View>
            ) : null}

            {modelsFromCache && !modelsError ? (
                <Text style={[styles.cacheNote, { color: theme.colors.text.tertiary }]}>
                    Showing last successful list. Refresh to fetch again.
                </Text>
            ) : null}

            <View style={styles.modelList}>
                {visibleModels.map((item) => {
                    const selected = item.id === model;
                    return (
                        <TouchableOpacity
                            key={item.id}
                            style={[
                                styles.modelRow,
                                {
                                    backgroundColor: selected ? theme.primary[100] : theme.colors.surface,
                                    borderColor: selected ? theme.primary[500] : theme.colors.border,
                                },
                            ]}
                            onPress={() => handleSelectModel(item.id)}
                        >
                            <Text
                                style={[
                                    styles.modelId,
                                    { color: theme.colors.text.primary },
                                ]}
                                numberOfLines={1}
                            >
                                {item.id}
                            </Text>
                            {item.isFallback ? (
                                <Text style={[styles.fallbackTag, { color: theme.colors.text.secondary }]}>
                                    default
                                </Text>
                            ) : null}
                            {selected ? (
                                <Ionicons name="checkmark-circle" size={18} color={theme.primary[500]} />
                            ) : null}
                        </TouchableOpacity>
                    );
                })}
            </View>

            {status ? (
                <Text style={[styles.status, { color: theme.colors.text.secondary }]}>{status}</Text>
            ) : null}
            {loadingState ? (
                <ActivityIndicator style={styles.loader} color={theme.primary[500]} />
            ) : null}
        </View>
    );
};

const styles = StyleSheet.create({
    wrap: {
        marginBottom: 8,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    help: {
        fontSize: 13,
        lineHeight: 18,
        marginBottom: 12,
    },
    providerGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 8,
    },
    providerChip: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
    },
    providerChipText: {
        fontSize: 14,
        fontWeight: '600',
    },
    providerFull: {
        fontSize: 13,
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    keyStatus: {
        fontSize: 14,
        marginBottom: 8,
    },
    keyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 8,
        paddingRight: 8,
        marginBottom: 12,
    },
    keyInput: {
        flex: 1,
        padding: 12,
        fontSize: 16,
    },
    iconButton: {
        padding: 8,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 20,
    },
    button: {
        flex: 1,
        padding: 14,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 48,
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    secondaryButton: {
        backgroundColor: 'transparent',
        borderWidth: 1,
    },
    secondaryButtonText: {
        fontSize: 16,
        fontWeight: '600',
    },
    modelHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    refresh: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 4,
    },
    refreshText: {
        fontSize: 14,
        fontWeight: '600',
    },
    errorBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        borderWidth: 1,
        borderRadius: 8,
        padding: 10,
        marginBottom: 10,
    },
    errorText: {
        flex: 1,
        fontSize: 13,
        lineHeight: 18,
    },
    cacheNote: {
        fontSize: 12,
        marginBottom: 8,
    },
    modelList: {
        gap: 8,
        marginBottom: 8,
    },
    modelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    modelId: {
        flex: 1,
        fontSize: 13,
        fontFamily: 'Courier',
    },
    fallbackTag: {
        fontSize: 11,
        textTransform: 'uppercase',
        fontWeight: '600',
    },
    status: {
        fontSize: 12,
        marginTop: 4,
    },
    loader: {
        marginTop: 8,
    },
});

export default AiProviderSettings;
