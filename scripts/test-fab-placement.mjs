#!/usr/bin/env node
/**
 * Shared floating-add position: bottom-right by default, normalized across
 * screen sizes, and list padding that keeps row delete/edit controls clear.
 */
import assert from 'node:assert/strict';
import {
    DEFAULT_FAB_POSITION,
    FAB_GAP,
    FAB_MARGIN_X,
    FAB_POSITION_KEY,
    FAB_SIZE,
    clampPrimaryOrigin,
    clusterOrigin,
    fabDragBounds,
    isPrimarySlot,
    listClearance,
    normalizedFromPrimaryOrigin,
    parseFabPosition,
    primaryOriginFromNormalized,
    readFabPosition,
    resetFabPosition,
    resolveFabGestureEnd,
    subscribeFabPlacement,
    writeFabPosition,
} from '../src/layout/fabPlacement.js';

const mem = new Map();
globalThis.localStorage = {
    getItem(key) {
        return mem.has(key) ? mem.get(key) : null;
    },
    setItem(key, value) {
        mem.set(key, String(value));
    },
    removeItem(key) {
        mem.delete(key);
    },
};

const checks = [];
const check = (label, ok) => {
    checks.push(label);
    assert.equal(ok, true, label);
    console.log(`ok  ${label}`);
};

resetFabPosition();

check('default is bottom-right', DEFAULT_FAB_POSITION.x === 1 && DEFAULT_FAB_POSITION.y === 1);
check('empty storage reads default', readFabPosition().x === 1 && readFabPosition().y === 1);
check('invalid json falls back', parseFabPosition('{').x === 1 && parseFabPosition('nope').y === 1);
check('non-numeric falls back', parseFabPosition('{"x":"a","y":1}').x === 1);
check('out of range clamps', parseFabPosition('{"x":4,"y":-2}').x === 1 && parseFabPosition('{"x":4,"y":-2}').y === 0);

const phone = fabDragBounds({ width: 390, height: 700 });
const primary = clusterOrigin({ x: 1, y: 1 }, phone, 1);
check('single + sits on the right edge', primary.primary.x === phone.right);
check('single + sits on the bottom edge', primary.primary.y === phone.bottom);
check(
    'right edge is inset from the screen',
    phone.right === 390 - FAB_MARGIN_X - FAB_SIZE
);
check('bottom clears the tab bar by the margin', phone.bottom === 700 - 12 - FAB_SIZE);

const pair = clusterOrigin({ x: 1, y: 1 }, phone, 2);
check('grouped extra button stays left of +', pair.left === pair.primary.x - (FAB_SIZE + FAB_GAP));
check('grouped + stays on the right edge', pair.primary.x === phone.right);
check('grouped cluster fits on screen', pair.left >= phone.left);

const wide = fabDragBounds({ width: 844, height: 390 });
const rotated = clusterOrigin({ x: 1, y: 1 }, wide, 1);
check('same normalized position pins + to the right after rotation', rotated.primary.x === wide.right);

const dragged = writeFabPosition({ x: 0.25, y: 0.4 });
const again = clusterOrigin(dragged, wide, 2);
const back = normalizedFromPrimaryOrigin(again.primary, wide);
check('round-trip keeps the shared ratio', Math.abs(back.x - 0.25) < 0.02 && Math.abs(back.y - 0.4) < 0.02);
check('stored value is normalized', mem.get(FAB_POSITION_KEY).includes('0.25'));

const rightPad = listClearance({ norm: { x: 1, y: 1 }, bounds: phone, fabCount: 1 });
check('right-side FAB pads the row past the button', rightPad.paddingRight >= FAB_SIZE + FAB_MARGIN_X);
check('bottom-parked FAB adds scroll space', rightPad.paddingBottom > FAB_SIZE);

const leftPad = listClearance({ norm: { x: 0, y: 0.2 }, bounds: phone, fabCount: 1 });
check('left-side FAB pads the left', leftPad.paddingLeft >= FAB_SIZE);
check('left-side FAB leaves the right edge at the normal inset', leftPad.paddingRight === 16);

const notched = fabDragBounds({ width: 390, height: 700, insetLeft: 40, insetRight: 28, insetTop: 12 });
check('left safe area widens the drag bound', notched.left === 48);
check('right safe area pulls the drag bound in', notched.right === 390 - 36 - FAB_SIZE);
check('top safe area starts the drag bound below the inset', notched.top === 20);

const clamped = clampPrimaryOrigin({ x: 0, y: 9999 }, phone, 1);
check('extras cannot be dragged off the left', clamped.x >= phone.left + FAB_SIZE + FAB_GAP);
check('vertical drag stays inside the screen', clamped.y === phone.bottom);

check('only the + slot arms placement when two buttons show', isPrimarySlot(0, 2) === false);
check('the right slot is primary', isPrimarySlot(FAB_SIZE + FAB_GAP + 4, 2) === true);
check('a lone + is always primary', isPrimarySlot(8, 1) === true);

check(
    'releasing the long-press stays in placement',
    resolveFabGestureEnd({ placing: true, enteredThisGesture: true, moved: false }) === 'stay'
);
check(
    'a drag while placing stays in placement',
    resolveFabGestureEnd({ placing: true, enteredThisGesture: false, moved: true }) === 'stay'
);
check(
    'a later tap exits placement',
    resolveFabGestureEnd({ placing: true, enteredThisGesture: false, moved: false }) === 'exit'
);
check(
    'a short tap outside placement opens add',
    resolveFabGestureEnd({ placing: false, enteredThisGesture: false, moved: false }) === 'tap'
);
check(
    'a cancelled drag does not open add',
    resolveFabGestureEnd({ placing: false, enteredThisGesture: false, moved: true }) === 'cancel'
);

let heard = null;
const unsubscribe = subscribeFabPlacement((pos) => {
    heard = pos;
});
resetFabPosition();
check('reset notifies listeners', heard?.x === 1 && heard?.y === 1);
check('reset clears storage', mem.get(FAB_POSITION_KEY) == null);
unsubscribe();

const fromNorm = primaryOriginFromNormalized({ x: 0, y: 1 }, phone);
check('normalized origin uses the drag bounds', fromNorm.x === phone.left && fromNorm.y === phone.bottom);

console.log(`\n${checks.length} fab placement checks passed`);
