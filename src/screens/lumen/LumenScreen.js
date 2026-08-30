// Lumen — the cognitive world. Mood, sleep, focus and journal.

import React, { useCallback, useState } from 'react';
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
import { HudBar, HudLabel, HudPanel, HudStat } from '../../galaxy/components/Hud';
import GlowButton from '../../components/GlowButton';
import AnimatedPressable from '../../components/AnimatedPressable';
import AnimatedListItem from '../../components/AnimatedListItem';
import useReducedMotion from '../../hooks/useReducedMotion';
import { PLANET_IDS } from '../../galaxy/planets';
import { SIGNAL_KINDS } from '../../galaxy/signalKinds';
import { transmit } from '../../galaxy/signals';
import { MOOD_SCALE, lumenOperations } from '../../database/lumen';
import { getSurfaceStyle, motion, typography } from '../../theme';

const DAY_MS = 24 * 60 * 60 * 1000;
const FOCUS_PRESETS = [15, 25, 45, 60, 90];
const SCALE_1_TO_5 = [1, 2, 3, 4, 5];

const EMPTY_STATS = {
    avgMood7d: null,
    avgEnergy7d: null,
    avgSleep7d: null,
    focusMinutes7d: 0,
    journalCount: 0,
    entryCount: 0,
    lastLogAt: null,
    streakDays: 0,
};

const KIND_META = {
    mood: { icon: 'happy', label: 'Mood' },
    sleep: { icon: 'moon', label: 'Sleep' },
    focus: { icon: 'bulb', label: 'Focus' },
    journal: { icon: 'book', label: 'Journal' },
};

const startOfDay = (timestamp) => {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
};

const relativeStamp = (timestamp) => {
    if (!timestamp) {
        return '—';
    }
    const days = Math.round((startOfDay(Date.now()) - startOfDay(timestamp)) / DAY_MS);
    const clock = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (days <= 0) {
        return `Today · ${clock}`;
    }
    if (days === 1) {
        return `Yesterday · ${clock}`;
    }
    if (days < 7) {
        return `${days}d ago · ${clock}`;
    }
    return new Date(timestamp).toLocaleDateString();
};

const numberOrNull = (value) => {
    const raw = String(value ?? '').trim();
    const parsed = Number(raw);
    return raw !== '' && Number.isFinite(parsed) ? parsed : null;
};

const clampHours = (value) => Math.min(14, Math.max(0, Math.round(Number(value) * 2) / 2));

const fg = (theme, level = 'primary') => ({ color: theme.colors.text[level] });

const inputSkin = (theme) => ({
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
});

// Each kind gets its own light so the merged feed stays readable at a glance.
const tintFor = (theme, accent, kind) => {
    if (kind === 'sleep') {
        return theme.colors.info;
    }
    if (kind === 'focus') {
        return theme.colors.warning;
    }
    if (kind === 'journal') {
        return theme.colors.success;
    }
    return accent[400];
};

const describeEntry = (entry) => {
    if (entry.kind === 'mood') {
        const step = MOOD_SCALE.find((item) => item.value === entry.mood);
        return {
            title: `${step?.glyph || ''} ${step?.label || 'Mood'}`.trim(),
            detail: entry.energy ? `Energy ${entry.energy}/5` : null,
            body: entry.note,
        };
    }
    if (entry.kind === 'sleep') {
        return {
            title: `${entry.hours ?? '—'}h slept`,
            detail: entry.quality ? `Quality ${entry.quality}/5` : null,
            body: entry.note,
        };
    }
    if (entry.kind === 'focus') {
        return {
            title: `${entry.minutes ?? 0} min focus`,
            detail: entry.label || null,
            body: entry.interrupted ? 'Interrupted' : null,
        };
    }
    return {
        title: entry.title || 'Journal entry',
        detail: entry.mood ? `Mood ${entry.mood}/5` : null,
        body: entry.body,
    };
};

const revealProps = (reduceMotion) => ({
    entering: reduceMotion ? undefined : FadeInDown.duration(motion.duration.enter).springify(),
    exiting: reduceMotion ? undefined : FadeOut.duration(motion.duration.fast),
    layout: reduceMotion ? undefined : LinearTransition.springify(),
});

const statCells = (stats, accent) => [
    {
        label: 'Mood',
        value: stats.avgMood7d === null ? '—' : stats.avgMood7d.toFixed(1),
        unit: '/5',
        tone: accent[400],
        icon: 'happy',
    },
    {
        label: 'Sleep',
        value: stats.avgSleep7d === null ? '—' : stats.avgSleep7d.toFixed(1),
        unit: 'h',
        icon: 'moon',
    },
    { label: 'Focus', value: String(stats.focusMinutes7d || 0), unit: 'min', icon: 'bulb' },
    {
        label: 'Streak',
        value: String(stats.streakDays || 0),
        unit: 'd',
        tone: stats.streakDays > 0 ? accent[300] : undefined,
        icon: 'time',
    },
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

const SaveButton = ({ theme, accent, label, saving, onSave }) => (
    <GlowButton
        label={saving ? 'SAVING…' : label}
        icon="checkmark"
        onPress={onSave}
        theme={theme}
        accent={accent}
        full
        disabled={saving}
        haptic="medium"
    />
);

const QuickTile = ({ theme, accent, icon, label, tint, active, onPress }) => (
    <AnimatedPressable
        onPress={onPress}
        tilt
        accessibilityRole="button"
        accessibilityLabel={`Log ${label}`}
        accessibilityState={{ selected: Boolean(active) }}
        style={[
            styles.tile,
            {
                backgroundColor: active ? theme.colors.surfaceElevated : theme.colors.surfaceGlass,
                borderColor: active ? tint : theme.colors.borderSoft,
            },
            active ? theme.glowFor(tint, 0.4) : null,
        ]}
    >
        <Ionicons name={icon} size={20} color={active ? tint : accent[300]} />
        <Text style={[styles.tileLabel, active ? { color: tint } : fg(theme, 'secondary')]}>
            {label.toUpperCase()}
        </Text>
    </AnimatedPressable>
);

const ScaleRow = ({ theme, tint, value, onSelect, prefix }) => (
    <View style={styles.row6}>
        {SCALE_1_TO_5.map((level) => {
            const active = value === level;
            return (
                <AnimatedPressable
                    key={level}
                    onPress={() => onSelect(active ? null : level)}
                    scaleTo={motion.scale.pressHard}
                    accessibilityRole="button"
                    accessibilityLabel={`${prefix} ${level} of 5`}
                    accessibilityState={{ selected: active }}
                    style={[
                        styles.scalePip,
                        {
                            backgroundColor: active ? tint : theme.colors.surfaceMuted,
                            borderColor: active ? tint : theme.colors.border,
                        },
                    ]}
                >
                    <Text style={[styles.scalePipLabel, fg(theme, active ? 'inverse' : 'tertiary')]}>
                        {level}
                    </Text>
                </AnimatedPressable>
            );
        })}
    </View>
);

const MoodForm = ({ theme, accent, draft, update, saving, onSave }) => (
    <>
        <HudLabel color={theme.colors.text.tertiary}>How does today feel</HudLabel>
        <View style={styles.row6}>
            {MOOD_SCALE.map((step) => {
                const active = draft.mood === step.value;
                return (
                    <AnimatedPressable
                        key={step.value}
                        onPress={() => update({ mood: active ? null : step.value })}
                        tilt
                        accessibilityRole="button"
                        accessibilityLabel={step.label}
                        accessibilityState={{ selected: active }}
                        style={[
                            styles.moodButton,
                            {
                                backgroundColor: active
                                    ? theme.colors.surfaceElevated
                                    : theme.colors.surfaceMuted,
                                borderColor: active ? accent[400] : theme.colors.border,
                            },
                            active ? theme.glowFor(accent[500], 0.4) : null,
                        ]}
                    >
                        <Text style={styles.moodGlyph}>{step.glyph}</Text>
                        <Text
                            numberOfLines={1}
                            style={[
                                styles.moodLabel,
                                active ? { color: accent[300] } : fg(theme, 'tertiary'),
                            ]}
                        >
                            {step.label}
                        </Text>
                    </AnimatedPressable>
                );
            })}
        </View>

        <Field theme={theme} label="Energy (optional)">
            <ScaleRow
                theme={theme}
                tint={accent[500]}
                value={draft.energy}
                onSelect={(level) => update({ energy: level })}
                prefix="Energy"
            />
        </Field>

        <Field
            theme={theme}
            label="Note (optional)"
            value={draft.note}
            onChangeText={(text) => update({ note: text })}
            placeholder="What moved the needle?"
        />

        <SaveButton theme={theme} accent={accent} label="LOG MOOD" saving={saving} onSave={onSave} />
    </>
);

const SleepForm = ({ theme, accent, draft, update, onStep, saving, onSave }) => (
    <>
        <HudLabel color={theme.colors.text.tertiary}>Hours slept</HudLabel>
        <View style={styles.stepperRow}>
            <AnimatedPressable
                onPress={() => onStep(-0.5)}
                accessibilityRole="button"
                accessibilityLabel="Half an hour less"
                style={[
                    styles.stepper,
                    { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border },
                ]}
            >
                <Ionicons name="remove" size={18} color={theme.colors.text.secondary} />
            </AnimatedPressable>
            <Input
                theme={theme}
                style={styles.stepperValue}
                value={draft.hours}
                onChangeText={(text) => update({ hours: text })}
                keyboardType="decimal-pad"
                placeholder="7.5"
            />
            <AnimatedPressable
                onPress={() => onStep(0.5)}
                accessibilityRole="button"
                accessibilityLabel="Half an hour more"
                style={[
                    styles.stepper,
                    { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border },
                ]}
            >
                <Ionicons name="add" size={18} color={theme.colors.text.secondary} />
            </AnimatedPressable>
        </View>

        <Field theme={theme} label="Quality (optional)">
            <ScaleRow
                theme={theme}
                tint={theme.colors.info}
                value={draft.quality}
                onSelect={(level) => update({ quality: level })}
                prefix="Quality"
            />
        </Field>

        <SaveButton theme={theme} accent={accent} label="LOG SLEEP" saving={saving} onSave={onSave} />
    </>
);

const FocusForm = ({ theme, accent, draft, update, saving, onSave }) => (
    <>
        <HudLabel color={theme.colors.text.tertiary}>Deep work length</HudLabel>
        <View style={styles.row6}>
            {FOCUS_PRESETS.map((preset) => {
                const active = numberOrNull(draft.minutes) === preset;
                return (
                    <AnimatedPressable
                        key={preset}
                        onPress={() => update({ minutes: String(preset) })}
                        accessibilityRole="button"
                        accessibilityLabel={`${preset} minutes`}
                        accessibilityState={{ selected: active }}
                        style={[
                            styles.preset,
                            {
                                backgroundColor: active
                                    ? theme.colors.warning
                                    : theme.colors.surfaceMuted,
                                borderColor: active ? theme.colors.warning : theme.colors.border,
                            },
                        ]}
                    >
                        <Text style={[styles.presetLabel, fg(theme, active ? 'inverse' : 'secondary')]}>
                            {preset}
                        </Text>
                    </AnimatedPressable>
                );
            })}
        </View>

        <Field
            theme={theme}
            label="Minutes"
            value={draft.minutes}
            onChangeText={(text) => update({ minutes: text })}
            keyboardType="numeric"
            placeholder="25"
        />
        <Field
            theme={theme}
            label="Label (optional)"
            value={draft.label}
            onChangeText={(text) => update({ label: text })}
            placeholder="Deep work on the nav computer"
        />

        <SaveButton theme={theme} accent={accent} label="LOG FOCUS" saving={saving} onSave={onSave} />
    </>
);

const JournalForm = ({ theme, accent, draft, update, saving, onSave }) => (
    <>
        <Field
            theme={theme}
            label="Title (optional)"
            value={draft.title}
            onChangeText={(text) => update({ title: text })}
            placeholder="Log entry"
        />
        <Field theme={theme} label="Entry">
            <Input
                theme={theme}
                style={styles.multiline}
                value={draft.body}
                onChangeText={(text) => update({ body: text })}
                placeholder="Where the day went."
                multiline
                numberOfLines={5}
                textAlignVertical="top"
            />
        </Field>
        <Field theme={theme} label="Mood (optional)">
            <ScaleRow
                theme={theme}
                tint={theme.colors.success}
                value={draft.mood}
                onSelect={(level) => update({ mood: level })}
                prefix="Mood"
            />
        </Field>

        <SaveButton theme={theme} accent={accent} label="SAVE ENTRY" saving={saving} onSave={onSave} />
    </>
);

const EntryRow = ({ theme, accent, entry, onDelete }) => {
    const meta = KIND_META[entry.kind] || KIND_META.journal;
    const tint = tintFor(theme, accent, entry.kind);
    const content = describeEntry(entry);

    return (
        <AnimatedPressable
            onLongPress={() => onDelete(entry)}
            scaleTo={0.99}
            accessibilityRole="button"
            accessibilityLabel={`${meta.label}: ${content.title}`}
            style={[styles.entry, getSurfaceStyle(theme, 'glass'), { borderLeftColor: tint }]}
        >
            <View
                style={[
                    styles.entryIcon,
                    { backgroundColor: theme.colors.surfaceMuted, borderColor: tint },
                ]}
            >
                <Ionicons name={meta.icon} size={16} color={tint} />
            </View>

            <View style={styles.entryBody}>
                <Text numberOfLines={1} style={[styles.entryTitle, fg(theme)]}>
                    {content.title}
                </Text>
                <Text style={[styles.entryMeta, fg(theme, 'tertiary')]}>
                    {relativeStamp(entry.logged_at)}
                    {content.detail ? ` · ${content.detail}` : ''}
                </Text>
                {content.body ? (
                    <Text numberOfLines={3} style={[styles.entryNote, fg(theme, 'secondary')]}>
                        {content.body}
                    </Text>
                ) : null}
            </View>

            <AnimatedPressable
                onPress={() => onDelete(entry)}
                accessibilityRole="button"
                accessibilityLabel="Delete entry"
                style={styles.iconAction}
            >
                <Ionicons name="trash" size={15} color={theme.colors.text.tertiary} />
            </AnimatedPressable>
        </AnimatedPressable>
    );
};

const LumenScreen = () => {
    const insets = useSafeAreaInsets();
    const reduceMotion = useReducedMotion();

    const [stats, setStats] = useState(EMPTY_STATS);
    const [entries, setEntries] = useState([]);
    const [openForm, setOpenForm] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const [moodDraft, setMoodDraft] = useState({ mood: null, energy: null, note: '' });
    const [sleepDraft, setSleepDraft] = useState({ hours: '7.5', quality: null });
    const [focusDraft, setFocusDraft] = useState({ minutes: '25', label: '' });
    const [journalDraft, setJournalDraft] = useState({ title: '', body: '', mood: null });

    const load = useCallback(async () => {
        try {
            const [nextStats, rows] = await Promise.all([
                lumenOperations.stats(),
                lumenOperations.listEntries(30),
            ]);
            setStats(nextStats || EMPTY_STATS);
            setEntries(rows || []);
            setError(null);
        } catch (loadError) {
            setError('Could not read the Lumen log.');
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    const toggleForm = useCallback((kind) => {
        setError(null);
        setOpenForm((current) => (current === kind ? null : kind));
    }, []);

    const updateMood = useCallback((patch) => {
        setMoodDraft((current) => ({ ...current, ...patch }));
    }, []);

    const updateSleep = useCallback((patch) => {
        setSleepDraft((current) => ({ ...current, ...patch }));
    }, []);

    const updateFocus = useCallback((patch) => {
        setFocusDraft((current) => ({ ...current, ...patch }));
    }, []);

    const updateJournal = useCallback((patch) => {
        setJournalDraft((current) => ({ ...current, ...patch }));
    }, []);

    const stepSleep = useCallback((delta) => {
        setSleepDraft((current) => ({
            ...current,
            hours: String(clampHours((numberOrNull(current.hours) ?? 0) + delta)),
        }));
    }, []);

    // One write path for all four kinds: persist, transmit, clear, reload.
    const commit = useCallback(
        async (write, reset, failure) => {
            setSaving(true);
            setError(null);
            try {
                const row = await write();
                if (!row) {
                    throw new Error('write rejected');
                }
                reset();
                setOpenForm(null);
                await load();
            } catch (saveError) {
                setError(failure);
            } finally {
                setSaving(false);
            }
        },
        [load]
    );

    const saveMood = useCallback(() => {
        if (!moodDraft.mood) {
            setError('Pick how the day felt first.');
            return;
        }
        commit(
            async () => {
                const row = await lumenOperations.logMood({
                    mood: moodDraft.mood,
                    energy: moodDraft.energy,
                    note: moodDraft.note.trim() || null,
                    loggedAt: Date.now(),
                });
                if (row) {
                    await transmit(SIGNAL_KINDS.MOOD_STATE, { payload: { mood: moodDraft.mood } });
                }
                return row;
            },
            () => setMoodDraft({ mood: null, energy: null, note: '' }),
            'That mood check-in could not be saved.'
        );
    }, [commit, moodDraft]);

    const saveSleep = useCallback(() => {
        const hours = numberOrNull(sleepDraft.hours);
        if (hours === null) {
            setError('Enter how many hours you slept.');
            return;
        }
        const clamped = clampHours(hours);
        commit(
            async () => {
                const row = await lumenOperations.logSleep({
                    hours: clamped,
                    quality: sleepDraft.quality,
                    note: null,
                    loggedAt: Date.now(),
                });
                if (row) {
                    await transmit(SIGNAL_KINDS.SLEEP_DEBT, { payload: { hours: clamped } });
                }
                return row;
            },
            () => setSleepDraft({ hours: '7.5', quality: null }),
            'That sleep log could not be saved.'
        );
    }, [commit, sleepDraft]);

    const saveFocus = useCallback(() => {
        const minutes = numberOrNull(focusDraft.minutes);
        if (!minutes || minutes <= 0) {
            setError('Enter the length of the focus block.');
            return;
        }
        const rounded = Math.round(minutes);
        commit(
            async () => {
                const row = await lumenOperations.logFocus({
                    minutes: rounded,
                    label: focusDraft.label.trim() || null,
                    interrupted: 0,
                    loggedAt: Date.now(),
                });
                if (row) {
                    await transmit(SIGNAL_KINDS.FOCUS_BLOCK, { payload: { minutes: rounded } });
                }
                return row;
            },
            () => setFocusDraft({ minutes: '25', label: '' }),
            'That focus block could not be saved.'
        );
    }, [commit, focusDraft]);

    const saveJournal = useCallback(() => {
        const body = journalDraft.body.trim();
        if (!body) {
            setError('Write something before saving the entry.');
            return;
        }
        commit(
            () =>
                lumenOperations.addJournal({
                    title: journalDraft.title.trim() || null,
                    body,
                    mood: journalDraft.mood,
                    loggedAt: Date.now(),
                }),
            () => setJournalDraft({ title: '', body: '', mood: null }),
            'That journal entry could not be saved.'
        );
    }, [commit, journalDraft]);

    const confirmRemove = useCallback(
        (entry) => {
            const meta = KIND_META[entry.kind] || { label: 'Entry' };
            Alert.alert('Delete entry?', `This ${meta.label.toLowerCase()} log will be removed.`, [
                { text: 'Keep', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await lumenOperations.remove(entry.kind, entry.id);
                            await load();
                        } catch (removeError) {
                            setError('Could not delete that entry.');
                        }
                    },
                },
            ]);
        },
        [load]
    );

    return (
        <PlanetScaffold planetId={PLANET_IDS.LUMEN} subtitle="Mind log">
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
                        <HudPanel theme={theme} title="Crew state" icon="pulse" index={0}>
                            <View style={styles.statRow}>
                                {statCells(stats, accent).map((cell) => (
                                    <HudStat key={cell.label} theme={theme} {...cell} />
                                ))}
                            </View>
                            <View style={styles.barBlock}>
                                <HudBar theme={theme} value={stats.streakDays} max={7} color={accent[500]} />
                            </View>
                        </HudPanel>

                        {error ? <Notice theme={theme} message={error} /> : null}

                        <View style={styles.tileRow}>
                            {Object.keys(KIND_META).map((kind) => (
                                <QuickTile
                                    key={kind}
                                    theme={theme}
                                    accent={accent}
                                    icon={KIND_META[kind].icon}
                                    label={KIND_META[kind].label}
                                    tint={tintFor(theme, accent, kind)}
                                    active={openForm === kind}
                                    onPress={() => toggleForm(kind)}
                                />
                            ))}
                        </View>

                        {openForm ? (
                            <Animated.View
                                {...revealProps(reduceMotion)}
                                style={[styles.composer, getSurfaceStyle(theme, 'elevated')]}
                            >
                                {openForm === 'mood' ? (
                                    <MoodForm
                                        theme={theme}
                                        accent={accent}
                                        draft={moodDraft}
                                        update={updateMood}
                                        saving={saving}
                                        onSave={saveMood}
                                    />
                                ) : null}
                                {openForm === 'sleep' ? (
                                    <SleepForm
                                        theme={theme}
                                        accent={accent}
                                        draft={sleepDraft}
                                        update={updateSleep}
                                        onStep={stepSleep}
                                        saving={saving}
                                        onSave={saveSleep}
                                    />
                                ) : null}
                                {openForm === 'focus' ? (
                                    <FocusForm
                                        theme={theme}
                                        accent={accent}
                                        draft={focusDraft}
                                        update={updateFocus}
                                        saving={saving}
                                        onSave={saveFocus}
                                    />
                                ) : null}
                                {openForm === 'journal' ? (
                                    <JournalForm
                                        theme={theme}
                                        accent={accent}
                                        draft={journalDraft}
                                        update={updateJournal}
                                        saving={saving}
                                        onSave={saveJournal}
                                    />
                                ) : null}
                            </Animated.View>
                        ) : null}

                        <View style={styles.sectionHead}>
                            <HudLabel color={theme.colors.text.tertiary}>Recent signals</HudLabel>
                        </View>

                        {entries.length === 0 ? (
                            <HudPanel theme={theme} index={1}>
                                <Text style={[styles.emptyText, fg(theme, 'secondary')]}>
                                    Lumen has no readings yet. Log a mood, a night of sleep or a
                                    focus block and the feed fills in.
                                </Text>
                                <GlowButton
                                    label="LOG A MOOD"
                                    icon="happy"
                                    onPress={() => toggleForm('mood')}
                                    theme={theme}
                                    accent={accent}
                                    variant="outline"
                                    size="sm"
                                    full
                                    style={styles.emptyAction}
                                />
                            </HudPanel>
                        ) : null}

                        {entries.map((entry, index) => (
                            <AnimatedListItem key={entry.key} index={index}>
                                <EntryRow
                                    theme={theme}
                                    accent={accent}
                                    entry={entry}
                                    onDelete={confirmRemove}
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
    tileRow: { flexDirection: 'row', gap: 8 },
    tile: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 14,
        borderWidth: 1,
        borderRadius: 16,
    },
    tileLabel: { fontSize: 9.5, fontWeight: '900', letterSpacing: typography.tracking.hud },
    composer: { padding: 14, gap: 12 },
    field: { gap: 6 },
    input: {
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: Platform.OS === 'ios' ? 11 : 8,
        fontSize: 15,
        fontWeight: '600',
    },
    multiline: { minHeight: 112, paddingTop: 12 },
    row6: { flexDirection: 'row', gap: 6 },
    moodButton: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: 12,
        borderWidth: 1,
        borderRadius: 14,
    },
    moodGlyph: { fontSize: 22 },
    moodLabel: { fontSize: 9, fontWeight: '800', letterSpacing: typography.tracking.wide },
    scalePip: {
        flex: 1,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderRadius: 10,
    },
    scalePipLabel: { fontSize: 12, fontWeight: '800' },
    stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    stepper: {
        width: 46,
        height: 46,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderRadius: 12,
    },
    stepperValue: { flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '900' },
    preset: {
        flex: 1,
        height: 38,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderRadius: 10,
    },
    presetLabel: { fontSize: 13, fontWeight: '800' },
    sectionHead: { marginTop: 8, paddingHorizontal: 2 },
    emptyText: { fontSize: 13.5, lineHeight: 20 },
    emptyAction: { marginTop: 12 },
    entry: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        padding: 12,
        borderLeftWidth: 3,
    },
    entryIcon: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderRadius: 10,
    },
    entryBody: { flex: 1, gap: 3 },
    entryTitle: { fontSize: 15, fontWeight: '800', letterSpacing: typography.tracking.tight },
    entryMeta: { fontSize: 11, fontWeight: '700' },
    entryNote: { fontSize: 13, lineHeight: 18, marginTop: 2 },
    iconAction: { padding: 6 },
});

export default LumenScreen;
