// Atlas — the fitness world. Training log, weekly volume, streaks.

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
import { HudBar, HudDivider, HudLabel, HudPanel, HudStat } from '../../galaxy/components/Hud';
import GlowButton from '../../components/GlowButton';
import AnimatedPressable from '../../components/AnimatedPressable';
import AnimatedListItem from '../../components/AnimatedListItem';
import useReducedMotion from '../../hooks/useReducedMotion';
import { PLANET_IDS } from '../../galaxy/planets';
import { SIGNAL_KINDS } from '../../galaxy/signalKinds';
import { transmit } from '../../galaxy/signals';
import { ATLAS_FOCUS, workoutOperations } from '../../database/atlas';
import { getSurfaceStyle, motion, typography } from '../../theme';

const DAY_MS = 24 * 60 * 60 * 1000;
const EFFORT_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const EMPTY_STATS = {
    totalSessions: 0,
    sessions7d: 0,
    volume7d: 0,
    volumeAllTime: 0,
    streakDays: 0,
    lastSessionAt: null,
    topExercise: null,
};

const startOfDay = (timestamp) => {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
};

const relativeDay = (timestamp) => {
    if (!timestamp) {
        return '—';
    }
    const days = Math.round((startOfDay(Date.now()) - startOfDay(timestamp)) / DAY_MS);
    if (days <= 0) {
        return 'Today';
    }
    if (days === 1) {
        return 'Yesterday';
    }
    if (days < 7) {
        return `${days}d ago`;
    }
    if (days < 35) {
        return `${Math.round(days / 7)}w ago`;
    }
    return new Date(timestamp).toLocaleDateString();
};

const compactNumber = (value) => {
    const amount = Math.round(Number(value) || 0);
    if (amount >= 1000000) {
        return `${(amount / 1000000).toFixed(1)}m`;
    }
    if (amount >= 1000) {
        return `${(amount / 1000).toFixed(1)}k`;
    }
    return String(amount);
};

const numberOrNull = (value) => {
    const raw = String(value ?? '').trim();
    const parsed = Number(raw);
    return raw !== '' && Number.isFinite(parsed) ? parsed : null;
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

const statCells = (stats, accent) => [
    {
        label: 'Sessions',
        value: String(stats.sessions7d),
        unit: '7d',
        tone: accent[400],
        icon: 'flame',
    },
    { label: 'Volume', value: compactNumber(stats.volume7d), unit: 'lb 7d', icon: 'trending-up' },
    {
        label: 'Streak',
        value: String(stats.streakDays),
        unit: 'd',
        tone: stats.streakDays > 0 ? accent[300] : undefined,
        icon: 'time',
    },
    { label: 'All time', value: compactNumber(stats.totalSessions), unit: 'log', icon: 'layers' },
];

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

const Chip = ({ theme, accent, label, selected, onPress }) => (
    <AnimatedPressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: Boolean(selected) }}
        style={[
            styles.chip,
            {
                backgroundColor: selected ? accent[500] : theme.colors.surfaceMuted,
                borderColor: selected ? accent[400] : theme.colors.border,
            },
            selected ? theme.glowFor(accent[500], 0.35) : null,
        ]}
    >
        <Text style={[styles.chipLabel, fg(theme, selected ? 'inverse' : 'secondary')]}>
            {label}
        </Text>
    </AnimatedPressable>
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

const EffortPips = ({ theme, accent, value, onSelect }) => (
    <View style={styles.pipRow}>
        {EFFORT_LEVELS.map((level) => {
            const active = (value || 0) >= level;
            return (
                <AnimatedPressable
                    key={level}
                    onPress={() => onSelect(value === level ? null : level)}
                    scaleTo={motion.scale.pressHard}
                    accessibilityRole="button"
                    accessibilityLabel={`Effort ${level} of 10`}
                    accessibilityState={{ selected: value === level }}
                    style={[
                        styles.pip,
                        {
                            backgroundColor: active ? accent[500] : theme.colors.surfaceMuted,
                            borderColor: active ? accent[400] : theme.colors.border,
                        },
                    ]}
                >
                    <Text style={[styles.pipLabel, fg(theme, active ? 'inverse' : 'tertiary')]}>
                        {level}
                    </Text>
                </AnimatedPressable>
            );
        })}
    </View>
);

const SetRow = ({ theme, accent, row, onChange, onRemove, reduceMotion }) => (
    <Animated.View
        layout={reduceMotion ? undefined : LinearTransition.springify()}
        style={styles.setRow}
    >
        <Input
            theme={theme}
            style={styles.setExercise}
            value={row.exercise}
            onChangeText={(text) => onChange(row.key, { exercise: text })}
            placeholder="Exercise"
        />
        <Input
            theme={theme}
            style={styles.setNumber}
            value={row.reps}
            onChangeText={(text) => onChange(row.key, { reps: text })}
            placeholder="reps"
            keyboardType="numeric"
        />
        <Input
            theme={theme}
            style={styles.setNumber}
            value={row.weight}
            onChangeText={(text) => onChange(row.key, { weight: text })}
            placeholder="wt"
            keyboardType="decimal-pad"
        />
        <AnimatedPressable
            onPress={() => onChange(row.key, { unit: row.unit === 'lb' ? 'kg' : 'lb' })}
            accessibilityRole="button"
            accessibilityLabel={`Unit ${row.unit}, tap to switch`}
            style={[
                styles.unitToggle,
                { backgroundColor: theme.colors.surfaceMuted, borderColor: accent.glow },
            ]}
        >
            <Text style={[styles.unitLabel, { color: accent[400] }]}>{row.unit.toUpperCase()}</Text>
        </AnimatedPressable>
        <AnimatedPressable
            onPress={() => onRemove(row.key)}
            accessibilityRole="button"
            accessibilityLabel="Remove set"
            style={styles.iconAction}
        >
            <Ionicons name="remove" size={16} color={theme.colors.text.tertiary} />
        </AnimatedPressable>
    </Animated.View>
);

const Composer = ({
    theme,
    accent,
    reduceMotion,
    draft,
    update,
    sets,
    setActions,
    saving,
    onSave,
}) => (
    <Animated.View
        {...revealProps(reduceMotion)}
        style={[styles.composer, getSurfaceStyle(theme, 'elevated')]}
    >
        <Field
            theme={theme}
            label="Session"
            value={draft.name}
            onChangeText={(text) => update({ name: text })}
            placeholder="Evening push"
            returnKeyType="done"
        />

        <Field theme={theme} label="Focus">
            <View style={styles.chipWrap}>
                {ATLAS_FOCUS.map((option) => (
                    <Chip
                        key={option}
                        theme={theme}
                        accent={accent}
                        label={option}
                        selected={draft.focus === option}
                        onPress={() => update({ focus: draft.focus === option ? null : option })}
                    />
                ))}
            </View>
        </Field>

        <Field
            theme={theme}
            label="Duration (min)"
            value={draft.duration}
            onChangeText={(text) => update({ duration: text })}
            placeholder="45"
            keyboardType="numeric"
        />

        <Field theme={theme} label="Perceived effort">
            <EffortPips
                theme={theme}
                accent={accent}
                value={draft.effort}
                onSelect={(level) => update({ effort: level })}
            />
        </Field>

        <HudDivider theme={theme} />

        <View style={styles.rowBetween}>
            <HudLabel color={theme.colors.text.tertiary}>Sets</HudLabel>
            <AnimatedPressable
                onPress={setActions.add}
                accessibilityRole="button"
                accessibilityLabel="Add set"
                style={[
                    styles.miniAction,
                    { borderColor: accent.glow, backgroundColor: theme.colors.surfaceMuted },
                ]}
            >
                <Ionicons name="add" size={13} color={accent[400]} />
                <Text style={[styles.miniLabel, { color: accent[400] }]}>ADD SET</Text>
            </AnimatedPressable>
        </View>

        {sets.map((row) => (
            <SetRow
                key={row.key}
                theme={theme}
                accent={accent}
                row={row}
                onChange={setActions.change}
                onRemove={setActions.remove}
                reduceMotion={reduceMotion}
            />
        ))}

        <GlowButton
            label={saving ? 'SAVING…' : 'SAVE SESSION'}
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

const SessionCard = ({ theme, accent, workout, expanded, onToggle, onDelete, reduceMotion }) => {
    const sets = workout.sets || [];
    return (
        <HudPanel theme={theme} index={0}>
            <AnimatedPressable
                onPress={() => onToggle(workout.id)}
                onLongPress={() => onDelete(workout)}
                scaleTo={0.99}
                accessibilityRole="button"
                accessibilityLabel={`${workout.name || 'Session'}, ${sets.length} sets`}
                style={styles.cardHead}
            >
                <View style={styles.flex}>
                    <Text numberOfLines={1} style={[styles.cardTitle, fg(theme)]}>
                        {workout.name || 'Session'}
                    </Text>
                    <View style={styles.cardMetaRow}>
                        {workout.focus ? (
                            <View
                                style={[
                                    styles.tag,
                                    {
                                        backgroundColor: theme.colors.surfaceMuted,
                                        borderColor: accent.glow,
                                    },
                                ]}
                            >
                                <Text style={[styles.tagLabel, { color: accent[300] }]}>
                                    {workout.focus.toUpperCase()}
                                </Text>
                            </View>
                        ) : null}
                        <Text style={[styles.cardMeta, fg(theme, 'tertiary')]}>
                            {relativeDay(workout.performed_at)}
                            {workout.duration_minutes ? ` · ${workout.duration_minutes} min` : ''}
                        </Text>
                    </View>
                </View>

                <View style={styles.cardNumbers}>
                    <Text style={[styles.cardVolume, { color: accent[400] }]}>
                        {compactNumber(workout.volume)}
                    </Text>
                    <Text style={[styles.cardMeta, fg(theme, 'tertiary')]}>
                        {sets.length} sets
                    </Text>
                </View>

                <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={theme.colors.text.tertiary}
                />
            </AnimatedPressable>

            {expanded ? (
                <Animated.View {...expandProps(reduceMotion)}>
                    <HudDivider theme={theme} />
                    {sets.length === 0 ? (
                        <Text style={[styles.cardMeta, fg(theme, 'tertiary')]}>
                            No sets recorded for this session.
                        </Text>
                    ) : (
                        sets.map((set) => (
                            <View key={set.id} style={styles.breakdownRow}>
                                <Text
                                    numberOfLines={1}
                                    style={[styles.breakdownName, fg(theme, 'secondary')]}
                                >
                                    {set.exercise}
                                </Text>
                                <Text style={[styles.breakdownValue, fg(theme)]}>
                                    {set.reps ?? '—'} × {set.weight ?? '—'} {set.unit || 'lb'}
                                </Text>
                            </View>
                        ))
                    )}

                    <AnimatedPressable
                        onPress={() => onDelete(workout)}
                        accessibilityRole="button"
                        accessibilityLabel="Delete session"
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

const AtlasScreen = () => {
    const insets = useSafeAreaInsets();
    const reduceMotion = useReducedMotion();
    const setKey = useRef(0);

    const [stats, setStats] = useState(EMPTY_STATS);
    const [sessions, setSessions] = useState([]);
    const [expandedId, setExpandedId] = useState(null);
    const [composerOpen, setComposerOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [draft, setDraft] = useState({ name: '', focus: null, duration: '', effort: null });
    const [sets, setSets] = useState([]);

    const load = useCallback(async () => {
        try {
            const [nextStats, rows] = await Promise.all([
                workoutOperations.stats(),
                workoutOperations.listRecent(12),
            ]);
            setStats(nextStats || EMPTY_STATS);
            setSessions(rows || []);
            setError(null);
        } catch (loadError) {
            setError('Could not read the training log.');
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    const blankSet = useCallback(() => {
        setKey.current += 1;
        return { key: `set-${setKey.current}`, exercise: '', reps: '', weight: '', unit: 'lb' };
    }, []);

    const updateDraft = useCallback((patch) => {
        setDraft((current) => ({ ...current, ...patch }));
    }, []);

    const addSet = useCallback(() => {
        const row = blankSet();
        setSets((current) => [...current, row]);
    }, [blankSet]);

    const changeSet = useCallback((key, patch) => {
        setSets((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    }, []);

    const removeSet = useCallback((key) => {
        setSets((current) => current.filter((row) => row.key !== key));
    }, []);

    const toggleComposer = useCallback(() => {
        if (composerOpen) {
            setComposerOpen(false);
            return;
        }
        if (sets.length === 0) {
            setSets([blankSet()]);
        }
        setComposerOpen(true);
    }, [blankSet, composerOpen, sets.length]);

    const handleSave = useCallback(async () => {
        const name = draft.name.trim();
        const cleanSets = sets
            .filter((row) => row.exercise.trim().length > 0)
            .map((row) => ({
                exercise: row.exercise.trim(),
                reps: numberOrNull(row.reps),
                weight: numberOrNull(row.weight),
                unit: row.unit,
            }));

        if (!name && cleanSets.length === 0) {
            setError('Name the session or log at least one set.');
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const workout = await workoutOperations.create({
                name: name || 'Session',
                focus: draft.focus,
                performedAt: Date.now(),
                durationMinutes: numberOrNull(draft.duration),
                perceivedEffort: draft.effort,
                notes: null,
                sets: cleanSets,
            });
            if (!workout) {
                throw new Error('write rejected');
            }

            await transmit(SIGNAL_KINDS.WORKOUT_BURN, {
                payloadRef: `workout:${workout.id}`,
                payload: { volume: workout.volume, name: workout.name },
            });
            if (draft.effort) {
                await transmit(SIGNAL_KINDS.TRAINING_LOAD, { payload: { strain: draft.effort } });
            }

            setDraft({ name: '', focus: null, duration: '', effort: null });
            setSets([]);
            setComposerOpen(false);
            await load();
        } catch (saveError) {
            setError('That session could not be saved. Nothing was lost — try again.');
        } finally {
            setSaving(false);
        }
    }, [draft, load, sets]);

    const confirmRemove = useCallback(
        (workout) => {
            Alert.alert(
                'Delete session?',
                `"${workout.name || 'Session'}" and its sets will be removed from Atlas.`,
                [
                    { text: 'Keep', style: 'cancel' },
                    {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: async () => {
                            try {
                                await workoutOperations.remove(workout.id);
                                await load();
                            } catch (removeError) {
                                setError('Could not delete that session.');
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
        <PlanetScaffold planetId={PLANET_IDS.ATLAS} subtitle="Training log">
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
                        <HudPanel theme={theme} title="System load" icon="barbell" index={0}>
                            <View style={styles.statRow}>
                                {statCells(stats, accent).map((cell) => (
                                    <HudStat key={cell.label} theme={theme} {...cell} />
                                ))}
                            </View>

                            <View style={styles.barBlock}>
                                <HudBar theme={theme} value={stats.streakDays} max={7} color={accent[500]} />
                            </View>

                            {stats.topExercise ? (
                                <>
                                    <HudDivider theme={theme} />
                                    <View style={styles.rowBetween}>
                                        <HudLabel color={theme.colors.text.tertiary}>
                                            Most logged
                                        </HudLabel>
                                        <Text
                                            numberOfLines={1}
                                            style={[styles.readoutValue, fg(theme, 'secondary')]}
                                        >
                                            {stats.topExercise}
                                        </Text>
                                    </View>
                                </>
                            ) : null}
                        </HudPanel>

                        {error ? <Notice theme={theme} message={error} /> : null}

                        <GlowButton
                            label={composerOpen ? 'CLOSE COMPOSER' : 'LOG SESSION'}
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
                                sets={sets}
                                setActions={{ add: addSet, change: changeSet, remove: removeSet }}
                                saving={saving}
                                onSave={handleSave}
                            />
                        ) : null}

                        <View style={styles.sectionHead}>
                            <HudLabel color={theme.colors.text.tertiary}>Recent sessions</HudLabel>
                        </View>

                        {sessions.length === 0 ? (
                            <HudPanel theme={theme} index={1}>
                                <Text style={[styles.emptyText, fg(theme, 'secondary')]}>
                                    Nothing logged on Atlas yet. Record a session and the cockpit
                                    flies the burn report over to the Galley.
                                </Text>
                                <GlowButton
                                    label="LOG FIRST SESSION"
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

                        {sessions.map((workout, index) => (
                            <AnimatedListItem key={workout.id} index={index}>
                                <SessionCard
                                    theme={theme}
                                    accent={accent}
                                    workout={workout}
                                    expanded={expandedId === workout.id}
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
    statRow: { flexDirection: 'row', gap: 8 },
    barBlock: { marginTop: 12 },
    rowBetween: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    readoutValue: { flexShrink: 1, fontSize: 13, fontWeight: '700' },
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
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 7,
    },
    chipLabel: { fontSize: 11.5, fontWeight: '800', letterSpacing: typography.tracking.wide },
    pipRow: { flexDirection: 'row', gap: 5 },
    pip: {
        flex: 1,
        height: 30,
        borderWidth: 1,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pipLabel: { fontSize: 11, fontWeight: '800' },
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
    setRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    setExercise: { flex: 1 },
    setNumber: { width: 58, textAlign: 'center', paddingHorizontal: 4 },
    unitToggle: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 10 },
    unitLabel: { fontSize: 10, fontWeight: '900', letterSpacing: typography.tracking.wide },
    iconAction: { padding: 6 },
    composerSave: { marginTop: 4 },
    sectionHead: { marginTop: 8, paddingHorizontal: 2 },
    emptyText: { fontSize: 13.5, lineHeight: 20 },
    emptyAction: { marginTop: 12 },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    cardTitle: { fontSize: 16, fontWeight: '800', letterSpacing: typography.tracking.tight },
    cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    cardMeta: { fontSize: 11.5, fontWeight: '600' },
    tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
    tagLabel: { fontSize: 9, fontWeight: '900', letterSpacing: typography.tracking.hud },
    cardNumbers: { alignItems: 'flex-end' },
    cardVolume: { fontSize: 17, fontWeight: '900', letterSpacing: typography.tracking.tight },
    breakdownRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 5,
    },
    breakdownName: { flex: 1, fontSize: 13, fontWeight: '600' },
    breakdownValue: { fontSize: 13, fontWeight: '800' },
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

export default AtlasScreen;
