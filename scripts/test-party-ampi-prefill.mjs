#!/usr/bin/env node
import assert from 'node:assert/strict';
import { PARTY_AMPI_PANTRY_PREFILL } from '../api/_lib/partyAmpiPrompt.js';
import { isPartyPantryMealPrompt } from '../api/_lib/partyPantryPrompt.js';

assert.match(PARTY_AMPI_PANTRY_PREFILL, /@Ampi/i);
assert.match(PARTY_AMPI_PANTRY_PREFILL, /pantries/i);
assert.ok(isPartyPantryMealPrompt(PARTY_AMPI_PANTRY_PREFILL));

console.log('party ampi prefill checks passed');
