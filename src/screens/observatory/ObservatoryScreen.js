// Observatory — the orbital lab station. Blood panels and biomarkers.

import React, { useCallback, useRef, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import PlanetScaffold from '../../galaxy/components/PlanetScaffold';
import { HudDivider, HudLabel, HudPanel, HudStat } from '../../galaxy/components/Hud';
import GlowButton from '../../components/GlowButton';
import AnimatedPressable from '../../components/AnimatedPressable';
import AnimatedListItem from '../../components/AnimatedListItem';
import useReducedMotion from '../../hooks/useReducedMotion';
import { PLANET_IDS } from '../../galaxy/planets';
import { SIGNAL_KINDS } from '../../galaxy/signalKinds';
import { transmit } from '../../galaxy/signals';
import { COMMON_MARKERS, labOperations } from '../../database/observatory';
import { getSurfaceStyle, motion, typography } from '../../theme';

const DAY_MS = 24 * 60 * 60 * 1000;
const EMPTY_STATS = { panels: 0, markers: 0, outOfRange: 0, lastPanelAt: null };

const pad = (value) => String(value).padStart(2, '0');

const todayStamp = () => {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

// Stored at midday so the panel stays on its intended calendar day in any zone.
const parseDate = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim());
    if (!match) {
        return null;
    }
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    const valid =
        date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    return valid ? date.getTime() : null;
};

const formatDate = (timestamp) => (timestamp ? new Date(timestamp).toLocaleDateString() : 'Undated');

const daysSince = (timestamp) =>
    timestamp ? Math.max(0, Math.floor((Date.now() - timestamp) / DAY_MS)) : null;

const numberOrNull = (value) => {
    const raw = String(value ?? '').trim();
    const parsed = Number(raw);
    return raw !== '' && Number.isFinite(parsed) ? parsed : null;
};

const flagColor = (theme, flag) => {
    if (flag === 'low') {
        return theme.colors.info;
    }
    if (flag === 'high') {
        return theme.colors.warning;
    }
    if (flag === 'normal') {
        return theme.colors.success;
    }
    return theme.colors.text.tertiary;
};

const referenceLabel = (marker) => {
    const low = marker.ref_low ?? null;
    const high = marker.ref_high ?? null;
    if (low === null && high === null) {
        return 'no range';
    }
    if (low === null) {
        return `≤ ${high}`;
    }
    if (high === null) {
        return `≥ ${low}`;
    }
    return `${low}–${high}`;
};

const fg = (theme, level = 'primary') => ({ color: theme.colors.text[level] });

const inputSkin = (theme) => ({
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
});

const revealProps = (reduceMotion) => ({
    entering: reduceMotion ? undefined : FadeInDown.duration(motion.duration.enter).springify(),
    exiting: reduceMotion ? undefined : FadeOut.duration(motion.duration.fast),
    layout: reduceMotion ? undefined : LinearTransition.springify(),
});

const expandProps = (reduceMotion) => ({
    entering: reduceMotion ? undefined : FadeInDown.duration(motion.duration.fast).springify(),
});

const statCells = (stats, theme, accent) => {
    const since = daysSince(stats.lastPanelAt);
    return [
        { label: 'Panels', value: String(stats.panels || 0), tone: accent[400], icon: 'flask' },
        { label: 'Markers', value: String(stats.markers || 0), icon: 'pulse' },
        {
            label: 'Flagged',
            value: String(stats.outOfRange || 0),
            tone: stats.outOfRange > 0 ? theme.colors.warning : undefined,
            icon: 'alert-circle',
        },
        {
            label: 'Last draw',
            value: since === null ? '—' : String(since),
            unit: since === null ? '' : 'd ago',
            icon: 'calendar',
        },
    ];
};

const Input = ({ theme, style, ...rest }) => (
    <TextInput
        style={[styles.input, inputSkin(theme), style]}
        placeholderTextColor={theme.colors.text.tertiary}
        keyboardAppearance={theme.isDark ? 'dark' : 'light'}
        {...rest}
    />
);

const Field = ({ theme, label, style, children, ...rest }) => (
    <View style={[styles.field, style]}>
        <HudLabel color={theme.colors.text.tertiary}>{label}</HudLabel>
        {children || <Input theme={theme} {...rest} />}
    </View>
);

const Notice = ({ theme, message }) => (
    <View
        style={[
            styles.notice,
            { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.error },
        ]}
    >
        <Ionicons name="alert-circle" size={15} color={theme.colors.error} />
        <Text style={[styles.noticeText, { color: theme.colors.error }]}>{message}</Text>
    </View>
);

const PresetChip = ({ theme, accent, label, onPress }) => (
    <AnimatedPressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Add ${label}`}
        style={[
            styles.chip,
            { backgroundColor: theme.colors.surfaceMuted, borderColor: accent.glow },
        ]}
    >
        <Ionicons name="add" size={12} color={accent[400]} />
        <Text style={[styles.chipLabel, { color: accent[300] }]}>{label}</Text>
    </AnimatedPressable>
);

const MarkerDraftRow = ({ theme, row, onChange, onRemove, reduceMotion }) => (
    <Animated.View
        layout={reduceMotion ? undefined : LinearTransition.springify()}
        style={[
            styles.markerCard,
            { backgroundColor: theme.colors.surfaceGlass, borderColor: theme.colors.borderSoft },
        ]}
    >
        <View style={styles.markerTopRow}>
            <Input
                theme={theme}
                style={styles.flex}
                value={row.name}
                onChangeText={(text) => onChange(row.key, { name: text })}
                placeholder="Marker"
            />
            <AnimatedPressable
                onPress={() => onRemove(row.key)}
                accessibilityRole="button"
                accessibilityLabel="Remove marker"
                style={styles.iconAction}
            >
                <Ionicons name="remove" size={16} color={theme.colors.text.tertiary} />
            </AnimatedPressable>
        </View>

        <View style={styles.markerNumberRow}>
            <Input
                theme={theme}
                style={styles.markerValue}
                value={row.value}
                onChangeText={(text) => onChange(row.key, { value: text })}
                placeholder="value"
                keyboardType="decimal-pad"
            />
            <Input
                theme={theme}
                style={styles.markerSmall}
                value={row.unit}
                onChangeText={(text) => onChange(row.key, { unit: text })}
                placeholder="unit"
                autoCapitalize="none"
            />
            <Input
                theme={theme}
                style={styles.markerSmall}
                value={row.refLow}
                onChangeText={(text) => onChange(row.key, { refLow: text })}
                placeholder="low"
                keyboardType="decimal-pad"
            />
            <Input
                theme={theme}
                style={styles.markerSmall}
                value={row.refHigh}
                onChangeText={(text) => onChange(row.key, { refHigh: text })}
                placeholder="high"
                keyboardType="decimal-pad"
            />
        </View>
    </Animated.View>
);

const Composer = ({
    theme,
    accent,
    reduceMotion,
    draft,
    update,
    markers,
    markerActions,
    saving,
    onSave,
}) => (
    <Animated.View
        {...revealProps(reduceMotion)}
        style={[styles.composer, getSurfaceStyle(theme, 'elevated')]}
    >
        <Field
            theme={theme}
            label="Panel"
            value={draft.name}
            onChangeText={(text) => update({ name: text })}
            placeholder="Annual bloodwork"
        />
        <View style={styles.splitRow}>
            <Field
                theme={theme}
                label="Collected"
                style={styles.flex}
                value={draft.collectedOn}
                onChangeText={(text) => update({ collectedOn: text })}
                placeholder="2026-08-29"
                autoCapitalize="none"
                autoCorrect={false}
            />
            <Field
                theme={theme}
                label="Source"
                style={styles.flex}
                value={draft.source}
                onChangeText={(text) => update({ source: text })}
                placeholder="Lab name"
            />
        </View>

        <HudDivider theme={theme} />

        <HudLabel color={theme.colors.text.tertiary}>Common markers</HudLabel>
        <View style={styles.chipWrap}>
            {COMMON_MARKERS.map((preset) => (
                <PresetChip
                    key={preset.name}
                    theme={theme}
                    accent={accent}
                    label={preset.name}
                    onPress={() => markerActions.add(preset)}
                />
            ))}
        </View>

        <View style={styles.rowBetween}>
            <HudLabel color={theme.colors.text.tertiary}>Markers</HudLabel>
            <AnimatedPressable
                onPress={() => markerActions.add(null)}
                accessibilityRole="button"
                accessibilityLabel="Add blank marker"
                style={[
                    styles.miniAction,
                    { borderColor: accent.glow, backgroundColor: theme.colors.surfaceMuted },
                ]}
            >
                <Ionicons name="add" size={13} color={accent[400]} />
                <Text style={[styles.miniLabel, { color: accent[400] }]}>BLANK ROW</Text>
            </AnimatedPressable>
        </View>

        {markers.map((row) => (
            <MarkerDraftRow
                key={row.key}
                theme={theme}
                row={row}
                onChange={markerActions.change}
                onRemove={markerActions.remove}
                reduceMotion={reduceMotion}
            />
        ))}

        <GlowButton
            label={saving ? 'SAVING…' : 'SAVE PANEL'}
            icon="checkmark"
            onPress={onSave}
            theme={theme}
            accent={accent}
            full
            disabled={saving}
            haptic="heavy"
            style={styles.composerSave}
        />
    </Animated.View>
);

const MarkerLine = ({ theme, marker }) => {
    const tint = flagColor(theme, marker.flag);
    return (
        <View style={styles.markerRow}>
            <View style={styles.flex}>
                <Text numberOfLines={1} style={[styles.markerRowTitle, fg(theme, 'secondary')]}>
                    {marker.name}
                </Text>
                <Text style={[styles.markerRowRef, fg(theme, 'tertiary')]}>
                    ref {referenceLabel(marker)}
                </Text>
            </View>
            <Text style={[styles.markerRowValue, fg(theme)]}>
                {marker.value ?? '—'}
                {marker.unit ? ` ${marker.unit}` : ''}
            </Text>
            <View
                style={[
                    styles.flagChip,
                    { borderColor: tint, backgroundColor: theme.colors.surfaceMuted },
                ]}
            >
                <Text style={[styles.flagChipLabel, { color: tint }]}>
                    {(marker.flag || 'unscored').toUpperCase()}
                </Text>
            </View>
        </View>
    );
};

const PanelCard = ({ theme, accent, panel, expanded, onToggle, onDelete, reduceMotion }) => {
    const markers = panel.markers || [];
    const flagged = panel.outOfRange || 0;

    return (
        <HudPanel theme={theme} index={0}>
            <AnimatedPressable
                onPress={() => onToggle(panel.id)}
                onLongPress={() => onDelete(panel)}
                scaleTo={0.99}
                accessibilityRole="button"
                accessibilityLabel={`${panel.name || 'Lab panel'}, ${markers.length} markers`}
                style={styles.cardHead}
            >
                <View style={styles.flex}>
                    <Text numberOfLines={1} style={[styles.cardTitle, fg(theme)]}>
                        {panel.name || 'Lab panel'}
                    </Text>
                    <Text numberOfLines={1} style={[styles.cardMeta, fg(theme, 'tertiary')]}>
                        {formatDate(panel.collected_at)}
                        {panel.source ? ` · ${panel.source}` : ''}
                        {` · ${markers.length} markers`}
                    </Text>
                </View>

                {flagged > 0 ? (
                    <View
                        style={[
                            styles.flagChip,
                            {
                                backgroundColor: theme.colors.surfaceMuted,
                                borderColor: theme.colors.warning,
                            },
                        ]}
                    >
                        <Text style={[styles.flagChipLabel, { color: theme.colors.warning }]}>
                            {flagged} OUT
                        </Text>
                    </View>
                ) : null}

                <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={accent[400]}
                />
            </AnimatedPressable>

            {expanded ? (
                <Animated.View {...expandProps(reduceMotion)}>
                    <HudDivider theme={theme} />
                    {markers.length === 0 ? (
                        <Text style={[styles.cardMeta, fg(theme, 'tertiary')]}>
                            This panel has no markers.
                        </Text>
                    ) : (
                        markers.map((marker) => (
                            <MarkerLine key={marker.id} theme={theme} marker={marker} />
                        ))
                    )}

                    <AnimatedPressable
                        onPress={() => onDelete(panel)}
                        accessibilityRole="button"
                        accessibilityLabel="Delete panel"
                        style={[styles.deleteRow, { borderColor: theme.colors.border }]}
                    >
                        <Ionicons name="trash" size={14} color={theme.colors.error} />
                        <Text style={[styles.deleteLabel, { color: theme.colors.error }]}>
                            DELETE
                        </Text>
                    </AnimatedPressable>
                </Animated.View>
            ) : null}
        </HudPanel>
    );
};

const ObservatoryScreen = () => {
    const insets = useSafeAreaInsets();
    const reduceMotion = useReducedMotion();
    const markerKey = useRef(0);

    const [stats, setStats] = useState(EMPTY_STATS);
    const [panels, setPanels] = useState([]);
    const [expandedId, setExpandedId] = useState(null);
    const [composerOpen, setComposerOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [draft, setDraft] = useState(() => ({
        name: '',
        collectedOn: todayStamp(),
        source: '',
    }));
    const [markers, setMarkers] = useState([]);

    const load = useCallback(async () => {
        try {
            const [nextStats, rows] = await Promise.all([
                labOperations.stats(),
                labOperations.listPanels(12),
            ]);
            setStats(nextStats || EMPTY_STATS);
            setPanels(rows || []);
            setError(null);
        } catch (loadError) {
            setError('Could not read the panel archive.');
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    const blankMarker = useCallback((preset) => {
        markerKey.current += 1;
        const asText = (value) => (value === null || value === undefined ? '' : String(value));
        return {
            key: `marker-${markerKey.current}`,
            name: preset?.name || '',
            value: '',
            unit: preset?.unit || '',
            refLow: asText(preset?.refLow),
            refHigh: asText(preset?.refHigh),
        };
    }, []);

    const updateDraft = useCallback((patch) => {
        setDraft((current) => ({ ...current, ...patch }));
    }, []);

    const addMarker = useCallback(
        (preset) => {
            const row = blankMarker(preset);
            setMarkers((current) => [...current, row]);
        },
        [blankMarker]
    );

    const changeMarker = useCallback((key, patch) => {
        setMarkers((current) =>
            current.map((row) => (row.key === key ? { ...row, ...patch } : row))
        );
    }, []);

    const removeMarker = useCallback((key) => {
        setMarkers((current) => current.filter((row) => row.key !== key));
    }, []);

    const toggleComposer = useCallback(() => {
        if (composerOpen) {
            setComposerOpen(false);
            return;
        }
        if (markers.length === 0) {
            setMarkers([blankMarker(null)]);
        }
        setComposerOpen(true);
    }, [blankMarker, composerOpen, markers.length]);

    const handleSave = useCallback(async () => {
        const collectedAt = parseDate(draft.collectedOn);
        if (collectedAt === null) {
            setError('Use a collection date shaped like 2026-08-29.');
            return;
        }

        const cleanMarkers = markers
            .filter((row) => row.name.trim().length > 0)
            .map((row) => ({
                name: row.name.trim(),
                value: numberOrNull(row.value),
                unit: row.unit.trim() || null,
                refLow: numberOrNull(row.refLow),
                refHigh: numberOrNull(row.refHigh),
            }));

        if (cleanMarkers.length === 0) {
            setError('Add at least one marker with a name.');
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const panel = await labOperations.createPanel({
                name: draft.name.trim() || 'Lab panel',
                collectedAt,
                source: draft.source.trim() || null,
                notes: null,
                markers: cleanMarkers,
            });
            if (!panel) {
                throw new Error('write rejected');
            }

            await transmit(SIGNAL_KINDS.LAB_MARKERS, {
                payloadRef: `panel:${panel.id}`,
                payload: {
                    markerCount: panel.markers?.length || 0,
                    outOfRange: panel.outOfRange || 0,
                },
            });

            setDraft({ name: '', collectedOn: todayStamp(), source: '' });
            setMarkers([]);
            setComposerOpen(false);
            await load();
        } catch (saveError) {
            setError('That panel could not be saved. Nothing was lost — try again.');
        } finally {
            setSaving(false);
        }
    }, [draft, load, markers]);

    const confirmRemove = useCallback(
        (panel) => {
            Alert.alert(
                'Delete panel?',
                `"${panel.name || 'Lab panel'}" and its markers will be removed from the archive.`,
                [
                    { text: 'Keep', style: 'cancel' },
                    {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: async () => {
                            try {
                                await labOperations.removePanel(panel.id);
                                await load();
                            } catch (removeError) {
                                setError('Could not delete that panel.');
                            }
                        },
                    },
                ]
            );
        },
        [load]
    );

    const toggleExpanded = useCallback((id) => {
        setExpandedId((current) => (current === id ? null : id));
    }, []);

    return (
        <PlanetScaffold planetId={PLANET_IDS.OBSERVATORY} subtitle="Lab archive">
            {({ theme, accent }) => (
                <KeyboardAvoidingView
                    style={styles.flex}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <ScrollView
                        style={styles.flex}
                        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 48 }]}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.stationNote}>
                            <Ionicons name="telescope" size={13} color={accent[400]} />
                            <Text style={[styles.stationText, fg(theme, 'tertiary')]}>
                                A station in orbit rather than a world — it watches the numbers the
                                other planets cannot see.
                            </Text>
                        </View>

                        <HudPanel theme={theme} title="Archive" icon="flask" index={0}>
                            <View style={styles.statRow}>
                                {statCells(stats, theme, accent).map((cell) => (
                                    <HudStat key={cell.label} theme={theme} {...cell} />
                                ))}
                            </View>
                        </HudPanel>

                        <HudPanel theme={theme} title="Read this first" icon="lock-closed" index={1}>
                            <Text style={[styles.disclaimer, fg(theme, 'secondary')]}>
                                This is a personal log, not medical advice — reference ranges differ
                                between labs and between people. Nothing you enter here leaves this
                                device.
                            </Text>
                        </HudPanel>

                        {error ? <Notice theme={theme} message={error} /> : null}

                        <GlowButton
                            label={composerOpen ? 'CLOSE COMPOSER' : 'NEW PANEL'}
                            icon={composerOpen ? 'close' : 'add'}
                            onPress={toggleComposer}
                            theme={theme}
                            accent={accent}
                            variant={composerOpen ? 'outline' : 'solid'}
                            size="lg"
                            full
                            haptic="medium"
                        />

                        {composerOpen ? (
                            <Composer
                                theme={theme}
                                accent={accent}
                                reduceMotion={reduceMotion}
                                draft={draft}
                                update={updateDraft}
                                markers={markers}
                                markerActions={{
                                    add: addMarker,
                                    change: changeMarker,
                                    remove: removeMarker,
                                }}
                                saving={saving}
                                onSave={handleSave}
                            />
                        ) : null}

                        <View style={styles.sectionHead}>
                            <HudLabel color={theme.colors.text.tertiary}>Panels</HudLabel>
                        </View>

                        {panels.length === 0 ? (
                            <HudPanel theme={theme} index={2}>
                                <Text style={[styles.emptyText, fg(theme, 'secondary')]}>
                                    No panels in the archive yet. Enter your last blood draw and the
                                    station starts tracking how the numbers move.
                                </Text>
                                <GlowButton
                                    label="ADD FIRST PANEL"
                                    icon="add"
                                    onPress={toggleComposer}
                                    theme={theme}
                                    accent={accent}
                                    variant="outline"
                                    size="sm"
                                    full
                                    style={styles.emptyAction}
                                />
                            </HudPanel>
                        ) : null}

                        {panels.map((panel, index) => (
                            <AnimatedListItem key={panel.id} index={index}>
                                <PanelCard
                                    theme={theme}
                                    accent={accent}
                                    panel={panel}
                                    expanded={expandedId === panel.id}
                                    onToggle={toggleExpanded}
                                    onDelete={confirmRemove}
                                    reduceMotion={reduceMotion}
                                />
                            </AnimatedListItem>
                        ))}
                    </ScrollView>
                </KeyboardAvoidingView>
            )}
        </PlanetScaffold>
    );
};

const styles = StyleSheet.create({
    flex: { flex: 1 },
    scroll: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
    stationNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 2 },
    stationText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '600' },
    statRow: { flexDirection: 'row', gap: 8 },
    disclaimer: { fontSize: 13, lineHeight: 19 },
    notice: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 9,
        paddingHorizontal: 12,
    },
    noticeText: { flex: 1, fontSize: 12.5, fontWeight: '600' },
    composer: { padding: 14, gap: 10 },
    field: { gap: 6 },
    splitRow: { flexDirection: 'row', gap: 10 },
    input: {
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: Platform.OS === 'ios' ? 11 : 8,
        fontSize: 15,
        fontWeight: '600',
    },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    chipLabel: { fontSize: 11, fontWeight: '800', letterSpacing: typography.tracking.wide },
    rowBetween: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 4,
    },
    miniAction: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    miniLabel: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: typography.tracking.hud,
        marginLeft: 4,
    },
    markerCard: { borderWidth: 1, borderRadius: 14, padding: 10, gap: 8 },
    markerTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    markerNumberRow: { flexDirection: 'row', gap: 6 },
    markerValue: { flex: 1.4, textAlign: 'center', paddingHorizontal: 4 },
    markerSmall: { flex: 1, textAlign: 'center', paddingHorizontal: 4, fontSize: 13 },
    iconAction: { padding: 6 },
    composerSave: { marginTop: 4 },
    sectionHead: { marginTop: 8, paddingHorizontal: 2 },
    emptyText: { fontSize: 13.5, lineHeight: 20 },
    emptyAction: { marginTop: 12 },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    cardTitle: { fontSize: 16, fontWeight: '800', letterSpacing: typography.tracking.tight },
    cardMeta: { fontSize: 11.5, fontWeight: '600', marginTop: 4 },
    markerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
    markerRowTitle: { fontSize: 13, fontWeight: '700' },
    markerRowRef: { fontSize: 10.5, fontWeight: '600', marginTop: 1 },
    markerRowValue: { fontSize: 13, fontWeight: '800' },
    flagChip: {
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 7,
        paddingVertical: 3,
        minWidth: 58,
        alignItems: 'center',
    },
    flagChipLabel: { fontSize: 8.5, fontWeight: '900', letterSpacing: typography.tracking.hud },
    deleteRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginTop: 10,
        paddingVertical: 8,
        borderWidth: 1,
        borderRadius: 10,
    },
    deleteLabel: { fontSize: 10.5, fontWeight: '900', letterSpacing: typography.tracking.hud },
});

export default ObservatoryScreen;
