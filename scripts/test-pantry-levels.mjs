#!/usr/bin/env node
import {
    amountLabel,
    clampPantryPct,
    freshnessLabel,
    sortPantryByUrgency,
} from '../src/utils/pantryLevels.js';

let failures = 0;
const check = (label, ok) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) failures += 1;
};

check('clamp', clampPantryPct(150) === 100 && clampPantryPct(-3) === 0);
check('fresh labels', freshnessLabel(90) === 'Fresh' && freshnessLabel(50) === 'Use soon' && freshnessLabel(10) === 'Going bad');
check('amount labels', amountLabel(90) === 'Full' && amountLabel(50) === 'Half' && amountLabel(10) === 'Almost out');
const sorted = sortPantryByUrgency([
    { name: 'ok', freshness_pct: 90, amount_pct: 90 },
    { name: 'bad', freshness_pct: 12, amount_pct: 80 },
]);
check('urgency sort', sorted[0].name === 'bad');

if (failures) process.exit(1);
console.log('pantry level checks passed');
