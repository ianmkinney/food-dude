#!/usr/bin/env node
import assert from 'node:assert/strict';
import { computeCenterCrop } from '../src/utils/coverImageMath.js';

const portrait = computeCenterCrop({ width: 3000, height: 4000 }, 1);
assert.equal(portrait.width, 3000);
assert.ok(portrait.height < 4000);
assert.ok(portrait.originY > 0);

const landscape = computeCenterCrop({ width: 4000, height: 3000 }, 1200 / 630);
assert.equal(landscape.width, 4000);
assert.ok(landscape.height < 3000);
assert.ok(landscape.originY > 0);

console.log('ok cover crop math');
