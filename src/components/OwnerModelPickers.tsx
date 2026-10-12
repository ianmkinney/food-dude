import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { fetchOwnerOpenRouterModels, type OpenRouterModelRow } from '../platform/ownerModelsApi';
import {
    clearOwnerChatModelPreference,
    clearOwnerImageModelPreference,
    getOwnerChatModelPreference,
    getOwnerImageModelPreference,
    setOwnerChatModelPreference,
    setOwnerImageModelPreference,
} from '../platform/ownerModelPreferences';

type Props = {
    theme: ReturnType<typeof import('../theme').getTheme>;
};

function formatPricePerMillion(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return 'price n/a';
    if (value < 0.01) return `$${value.toFixed(4)}/1M tokens`;
    if (value < 1) return `$${value.toFixed(3)}/1M tokens`;
    return `$${value.toFixed(2)}/1M tokens`;
}

function ModelPicker({
    label,
    models,
    selectedId,
    defaultId,
    onSelect,
    onReset,
    theme,
}: {
    label: string;
    models: OpenRouterModelRow[];
    selectedId: string;
    defaultId: string;
    onSelect: (id: string) => void;
    onReset?: () => void;
    theme: ReturnType<typeof import('../theme').getTheme>;
}) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const c = theme.colors;
    const selected = models.find((m) => m.id === selectedId);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return models.slice(0, 80);
        return models
            .filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
            .slice(0, 80);
    }, [models, query]);

    return (
        <View style={styles.block}>
            <Text style={[styles.label, { color: c.text.primary }]}>{label}</Text>
            <View style={styles.selectedRowWrap}>
                <Pressable
                    onPress={() => setOpen((v) => !v)}
                    style={[styles.selectedRow, { borderColor: c.border, backgroundColor: c.surface, flex: 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`${label}, ${selected?.name || selectedId}`}
                >
                    <View style={styles.selectedText}>
                        <Text style={[styles.selectedName, { color: c.text.primary }]} numberOfLines={1}>
                            {selected?.name || selectedId}
                        </Text>
                        <Text style={[styles.selectedMeta, { color: c.text.tertiary }]} numberOfLines={1}>
                            {formatPricePerMillion(selected?.pricePerMillion)} · {selectedId}
                        </Text>
                    </View>
                    <Text style={{ color: theme.primary[500], fontWeight: '700' }}>{open ? 'Done' : 'Change'}</Text>
                </Pressable>
                {onReset && selectedId !== defaultId ? (
                    <Pressable
                        onPress={onReset}
                        style={[styles.resetPill, { borderColor: c.border, backgroundColor: c.surfaceMuted }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Reset ${label} to default`}
                    >
                        <Text style={[styles.resetText, { color: c.text.secondary }]}>Reset to default</Text>
                    </Pressable>
                ) : null}
            </View>
            {open ? (
                <>
                    <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Search models…"
                        placeholderTextColor={c.text.tertiary}
                        style={[styles.search, { color: c.text.primary, borderColor: c.border, backgroundColor: c.surface }]}
                        accessibilityLabel={`Search ${label}`}
                        autoCorrect={false}
                        autoCapitalize="none"
                    />
                    <ScrollView style={[styles.list, { borderColor: c.border }]} keyboardShouldPersistTaps="handled">
                        {filtered.map((row) => {
                            const active = row.id === selectedId;
                            return (
                                <Pressable
                                    key={row.id}
                                    onPress={() => {
                                        onSelect(row.id);
                                        setOpen(false);
                                        setQuery('');
                                    }}
                                    style={[
                                        styles.option,
                                        { backgroundColor: active ? theme.primary[500] + '18' : c.surface },
                                    ]}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: active }}
                                >
                                    <Text style={[styles.optionName, { color: c.text.primary }]} numberOfLines={2}>
                                        {row.name}
                                    </Text>
                                    <Text style={[styles.optionMeta, { color: c.text.secondary }]} numberOfLines={1}>
                                        {formatPricePerMillion(row.pricePerMillion)} · {row.id}
                                    </Text>
                                </Pressable>
                            );
                        })}
                        {!filtered.length ? (
                            <Text style={[styles.empty, { color: c.text.tertiary }]}>No models match.</Text>
                        ) : null}
                    </ScrollView>
                </>
            ) : null}
        </View>
    );
}

export default function OwnerModelPickers({ theme }: Props) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [chatModels, setChatModels] = useState<OpenRouterModelRow[]>([]);
    const [imageModels, setImageModels] = useState<OpenRouterModelRow[]>([]);
    const [chatId, setChatId] = useState('');
    const [imageId, setImageId] = useState('');
    const [defaultChatId, setDefaultChatId] = useState('');
    const [defaultImageId, setDefaultImageId] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [catalog, savedChat, savedImage] = await Promise.all([
                fetchOwnerOpenRouterModels(),
                getOwnerChatModelPreference(),
                getOwnerImageModelPreference(),
            ]);
            setChatModels(catalog.chatModels);
            setImageModels(catalog.imageModels);
            setDefaultChatId(catalog.defaults.chat);
            setDefaultImageId(catalog.defaults.image);
            const chatDefault =
                (savedChat && catalog.chatModels.some((m) => m.id === savedChat) ? savedChat : null) ||
                catalog.defaults.chat;
            const imageDefault =
                (savedImage && catalog.imageModels.some((m) => m.id === savedImage) ? savedImage : null) ||
                catalog.defaults.image;
            setChatId(chatDefault);
            setImageId(imageDefault);
            if (savedChat && savedChat !== chatDefault) await setOwnerChatModelPreference(chatDefault);
            if (savedImage && savedImage !== imageDefault) await setOwnerImageModelPreference(imageDefault);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load models.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const c = theme.colors;
    if (loading) {
        return <Text style={[styles.hint, { color: c.text.secondary }]}>Loading OpenRouter models…</Text>;
    }
    if (error) {
        return (
            <View style={styles.block}>
                <Text style={[styles.hint, { color: theme.colors.error }]}>{error}</Text>
                <Pressable onPress={load} accessibilityRole="button">
                    <Text style={{ color: theme.primary[500], fontWeight: '600' }}>Retry</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={styles.wrap}>
            <Text style={[styles.title, { color: c.text.primary }]}>OpenRouter models</Text>
            <Text style={[styles.hint, { color: c.text.secondary }]}>
                Chat models must support Ampi tools and structured JSON replies. Only compatible models are listed.
                Overrides apply on this device for allowlisted owner sessions.
            </Text>
            <ModelPicker
                label="Chat model"
                models={chatModels}
                selectedId={chatId}
                defaultId={defaultChatId}
                onSelect={async (id) => {
                    setChatId(id);
                    await setOwnerChatModelPreference(id);
                }}
                onReset={async () => {
                    await clearOwnerChatModelPreference();
                    setChatId(defaultChatId);
                }}
                theme={theme}
            />
            <ModelPicker
                label="Image model"
                models={imageModels}
                selectedId={imageId}
                defaultId={defaultImageId}
                onSelect={async (id) => {
                    setImageId(id);
                    await setOwnerImageModelPreference(id);
                }}
                onReset={async () => {
                    await clearOwnerImageModelPreference();
                    setImageId(defaultImageId);
                }}
                theme={theme}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { gap: 10, marginTop: 4 },
    block: { gap: 8 },
    title: { fontSize: 16, fontWeight: '700' },
    hint: { fontSize: 14, lineHeight: 20 },
    label: { fontSize: 14, fontWeight: '600' },
    selectedRowWrap: { flexDirection: 'row', alignItems: 'stretch', gap: 8, flexWrap: 'wrap' },
    selectedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        minHeight: 44,
    },
    resetPill: {
        minHeight: 44,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: StyleSheet.hairlineWidth,
        justifyContent: 'center',
        alignItems: 'center',
    },
    resetText: { fontSize: 13, fontWeight: '600' },
    selectedText: { flex: 1, gap: 2 },
    selectedName: { fontSize: 15, fontWeight: '600' },
    selectedMeta: { fontSize: 12 },
    search: {
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 15,
        minHeight: 44,
    },
    list: { maxHeight: 220, borderWidth: 1, borderRadius: 12 },
    option: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#00000014' },
    optionName: { fontSize: 14, fontWeight: '600' },
    optionMeta: { fontSize: 12, marginTop: 2 },
    empty: { padding: 12, fontSize: 14 },
});
