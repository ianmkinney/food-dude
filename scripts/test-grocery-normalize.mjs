#!/usr/bin/env node
import { normalizeGroceryRows } from '../src/utils/groceryItem.js';

let failures = 0;
const check = (label, ok) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) failures += 1;
};

const rows = normalizeGroceryRows([
    { id: 1, name: 'Milk', category: 12, is_checked: 0 },
    null,
    { id: 2, name: null, category: 'Dairy', is_checked: '1' },
    { id: 3, category: 'Produce' },
]);

check('drops null rows', rows.length === 3);
check('coerces category to string', rows[0].category === '12');
check('default name', rows[2].name === 'Item');
check('checked from string', rows[1].is_checked === true);

if (failures) process.exit(1);
console.log('grocery normalize checks passed');
