#!/usr/bin/env node
import {
    daysUntilExpiration,
    expirationBadge,
    pantryExpirationToStorage,
    sortPantryItemsByExpiration,
} from '../src/utils/pantryExpiration.js';

let failures = 0;
const check = (label, ok) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) failures += 1;
};

const today = new Date();
today.setHours(12, 0, 0, 0);
const inThree = new Date(today);
inThree.setDate(inThree.getDate() + 3);
const y = inThree.getFullYear();
const m = String(inThree.getMonth() + 1).padStart(2, '0');
const d = String(inThree.getDate()).padStart(2, '0');
const iso = `${y}-${m}-${d}`;

check('storage round-trip', pantryExpirationToStorage(iso) === iso);
check('soon badge', expirationBadge(iso)?.tone === 'soon');
check('days until', daysUntilExpiration(iso) === 3);

const sorted = sortPantryItemsByExpiration([
    { id: 1, name: 'Later', expiration_date: '2099-01-01' },
    { id: 2, name: 'Soon', expiration_date: iso },
    { id: 3, name: 'None' },
]);
check('sort expiring first', sorted[0].name === 'Soon');

if (failures) process.exit(1);
console.log('pantry expiration checks passed');
