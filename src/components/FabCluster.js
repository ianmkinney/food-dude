import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FloatingActionButton from './FloatingActionButton';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
    FAB_LONG_PRESS_MS,
    FAB_TAP_SLOP_PX,
    clampPrimaryOrigin,
    clusterOrigin,
    fabDragBounds,
    isPrimarySlot,
    normalizedFromPrimaryOrigin,
    readFabPosition,
    resolveFabGestureEnd,
    writeFabPosition,
} from '../layout/fabPlacement';
import { useFabPosition } from '../layout/floatingActionLayout';

const JIGGLE_STYLE_ID = 'af-fab-jiggle';

function ensureJiggleCss() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(JIGGLE_STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = JIGGLE_STYLE_ID;
    el.textContent = `
        @keyframes af-fab-jiggle {
            0% { transform: rotate(-2.4deg); }
            50% { transform: rotate(2.6deg); }
            100% { transform: rotate(-2.4deg); }
        }
        .af-fab-jiggle {
            animation: af-fab-jiggle 0.28s ease-in-out infinite;
            transform-origin: center center;
        }
    `;
    document.head.appendChild(el);
}

function lockClusterChrome(el) {
    if (!el?.querySelectorAll) return;
    [el, ...el.querySelectorAll('*')].forEach((node) => {
        if (!node.style) return;
        node.style.touchAction = 'none';
        node.style.webkitTouchCallout = 'none';
        node.style.webkitUserSelect = 'none';
        node.style.userSelect = 'none';
    });
}

function pointFromEvent(event) {
    const touch = event.touches?.[0] || event.changedTouches?.[0];
    if (touch) return { x: touch.clientX, y: touch.clientY };
    return { x: event.clientX, y: event.clientY };
}

/**
 * Bottom-right add button (and any sibling FABs) with a shared drag position.
 * Long-press the + for 3 seconds to unlock placement. A later tap saves and exits.
 */
export default function FabCluster({ actions, frame }) {
    const visible = (actions || []).filter((action) => action && !action.hidden);
    const fabCount = visible.length;
    const norm = useFabPosition();
    const reduceMotion = useReducedMotion();
    const safe = useSafeAreaInsets();
    const clusterRef = useRef(null);
    const [placing, setPlacing] = useState(false);
    const placingRef = useRef(false);
    const normRef = useRef(norm);
    const frameRef = useRef(frame);
    const insetRef = useRef({ insetLeft: safe.left, insetRight: safe.right, insetTop: 0 });
    const countRef = useRef(fabCount);
    const gestureRef = useRef(null);
    const timerRef = useRef(null);
    const suppressRef = useRef(false);

    useEffect(() => {
        normRef.current = norm;
    }, [norm]);
    frameRef.current = frame;
    insetRef.current = { insetLeft: safe.left, insetRight: safe.right, insetTop: 0 };
    countRef.current = fabCount;

    useEffect(() => {
        ensureJiggleCss();
    }, []);

    useEffect(() => {
        const el = clusterRef.current;
        if (!el?.querySelectorAll) return undefined;
        lockClusterChrome(el);
        if (el.dataset) el.dataset.placing = placing ? 'true' : 'false';
        el.querySelectorAll(':scope > *').forEach((node) => {
            node.classList.toggle('af-fab-jiggle', placing && !reduceMotion);
        });
        return undefined;
    }, [placing, reduceMotion, fabCount, norm.x, norm.y]);

    useEffect(() => {
        const el = clusterRef.current;
        if (!el || typeof el.addEventListener !== 'function') return undefined;

        const boundsNow = () =>
            fabDragBounds({
                width: frameRef.current?.width || 0,
                height: frameRef.current?.height || 0,
                ...insetRef.current,
            });

        const clearTimer = () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };

        let suppressTimer = null;
        const armSuppress = () => {
            suppressRef.current = true;
            if (suppressTimer) clearTimeout(suppressTimer);
            // A previous hold can still have a timer pending. Replacing it keeps
            // the exit tap from opening Add when the click arrives a moment later.
            suppressTimer = setTimeout(() => {
                suppressRef.current = false;
                suppressTimer = null;
            }, 800);
        };

        let pointerActive = false;

        const begin = (event, pointerId) => {
            if (event.button != null && event.button !== 0) return;
            clearTimer();
            const rect = el.getBoundingClientRect();
            const p = pointFromEvent(event);
            const localX = p.x - rect.left;
            const onPrimary = isPrimarySlot(localX, countRef.current);
            gestureRef.current = {
                x: p.x,
                y: p.y,
                moved: false,
                entered: false,
                onPrimary,
                pointerId,
            };
            if (placingRef.current) {
                const cluster = clusterOrigin(normRef.current, boundsNow(), countRef.current);
                gestureRef.current.primary = cluster.primary;
                try {
                    if (pointerId != null) el.setPointerCapture?.(pointerId);
                } catch {
                    // ignore
                }
                return;
            }
            if (!onPrimary) return;
            timerRef.current = setTimeout(() => {
                const gesture = gestureRef.current;
                if (!gesture || gesture.moved) return;
                gesture.entered = true;
                placingRef.current = true;
                setPlacing(true);
                const cluster = clusterOrigin(readFabPosition(), boundsNow(), countRef.current);
                gesture.primary = cluster.primary;
                armSuppress();
                try {
                    navigator.vibrate?.(20);
                } catch {
                    // vibrate is unavailable on most iOS builds
                }
                try {
                    if (gesture.pointerId != null) el.setPointerCapture?.(gesture.pointerId);
                } catch {
                    // ignore
                }
            }, FAB_LONG_PRESS_MS);
        };

        const onPointerDown = (event) => {
            pointerActive = true;
            if (gestureRef.current) {
                gestureRef.current.pointerId = event.pointerId;
                return;
            }
            begin(event, event.pointerId);
        };

        const onTouchStart = (event) => {
            if (pointerActive) return;
            begin(event, null);
        };

        const onMove = (event) => {
            const gesture = gestureRef.current;
            if (!gesture) return;
            const p = pointFromEvent(event);
            const dx = p.x - gesture.x;
            const dy = p.y - gesture.y;
            if (Math.hypot(dx, dy) > FAB_TAP_SLOP_PX) {
                gesture.moved = true;
                if (!placingRef.current && !gesture.entered) clearTimer();
            }
            if (placingRef.current || gesture.entered) {
                event.preventDefault?.();
                if (!gesture.primary) return;
                const bounds = boundsNow();
                const next = {
                    x: gesture.primary.x + dx,
                    y: gesture.primary.y + dy,
                };
                const extra = Math.max(0, countRef.current - 1);
                const clamped = clampPrimaryOrigin(next, bounds, extra);
                writeFabPosition(normalizedFromPrimaryOrigin(clamped, bounds));
                return;
            }
            if (gesture.onPrimary) event.preventDefault?.();
        };

        const onPointerMove = (event) => onMove(event);
        const onTouchMove = (event) => {
            if (pointerActive) return;
            onMove(event);
        };

        const onUp = () => {
            clearTimer();
            const gesture = gestureRef.current;
            gestureRef.current = null;
            pointerActive = false;
            if (!gesture) return;
            const decision = resolveFabGestureEnd({
                placing: placingRef.current,
                enteredThisGesture: gesture.entered,
                moved: gesture.moved,
            });
            if (decision === 'exit') {
                armSuppress();
                placingRef.current = false;
                setPlacing(false);
                writeFabPosition(normRef.current);
                return;
            }
            if (decision === 'stay') {
                armSuppress();
                writeFabPosition(normRef.current);
            }
        };

        const onContext = (event) => {
            event.preventDefault?.();
        };

        lockClusterChrome(el);
        el.addEventListener('pointerdown', onPointerDown);
        el.addEventListener('pointermove', onPointerMove);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onUp);
        el.addEventListener('touchstart', onTouchStart, { passive: true });
        el.addEventListener('touchmove', onTouchMove, { passive: false });
        el.addEventListener('touchend', onUp);
        el.addEventListener('touchcancel', onUp);
        el.addEventListener('contextmenu', onContext);
        el.addEventListener('selectstart', onContext);
        return () => {
            clearTimer();
            if (suppressTimer) clearTimeout(suppressTimer);
            el.removeEventListener('pointerdown', onPointerDown);
            el.removeEventListener('pointermove', onPointerMove);
            el.removeEventListener('pointerup', onUp);
            el.removeEventListener('pointercancel', onUp);
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchmove', onTouchMove);
            el.removeEventListener('touchend', onUp);
            el.removeEventListener('touchcancel', onUp);
            el.removeEventListener('contextmenu', onContext);
            el.removeEventListener('selectstart', onContext);
        };
    }, []);

    if (!fabCount) return null;

    const bounds = fabDragBounds({
        width: frame?.width || 0,
        height: frame?.height || 0,
        insetLeft: safe.left,
        insetRight: safe.right,
        insetTop: 0,
    });
    const positioned = frame?.width > 0 && frame?.height > 0;
    const cluster = positioned ? clusterOrigin(norm, bounds, fabCount) : null;

    return (
        <View
            ref={clusterRef}
            testID="fab-cluster"
            pointerEvents="box-none"
            style={[
                styles.cluster,
                positioned
                    ? { left: cluster.left, top: cluster.top }
                    : styles.pending,
                placing && styles.placing,
            ]}
        >
            {visible.map((action, index) => {
                const primary = index === visible.length - 1;
                return (
                    <View
                        key={action.key}
                        testID={action.testID || (primary ? 'fab-add' : undefined)}
                        style={[
                            placing && !reduceMotion ? styles.jiggleFallback : null,
                            placing && reduceMotion ? styles.placingStill : null,
                        ]}
                    >
                        <FloatingActionButton
                            theme={action.theme}
                            color={action.color}
                            style={action.style}
                            disabled={action.disabled}
                            accessibilityLabel={
                                placing
                                    ? `${action.accessibilityLabel}. Drag to move, tap to save the position.`
                                    : action.accessibilityLabel
                            }
                            accessibilityHint={primary ? 'Hold for 3 seconds to move this button.' : undefined}
                            morphTo={placing ? undefined : action.morphTo}
                            onPress={() => {
                                if (suppressRef.current || placingRef.current) return;
                                action.onPress?.();
                            }}
                        >
                            {action.icon}
                        </FloatingActionButton>
                    </View>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    cluster: {
        position: 'absolute',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        zIndex: 20,
        ...(Platform.OS === 'web'
            ? {
                  touchAction: 'none',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  WebkitTouchCallout: 'none',
              }
            : null),
    },
    pending: {
        right: 20,
        bottom: 12,
    },
    placing: {
        zIndex: 30,
    },
    jiggleFallback: {
        // Keyframes are injected on web. This keeps a visible unlocked state if animation is ignored.
    },
    placingStill: {
        transform: [{ scale: 1.04 }],
    },
});
