#!/usr/bin/env node
/**
 * Keep app.json expo.version aligned with package.json (app.config.js also reads package.json).
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const appPath = path.join(root, 'app.json');
const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));

if (app.expo.version !== pkg.version) {
    app.expo.version = pkg.version;
    fs.writeFileSync(appPath, `${JSON.stringify(app, null, 2)}\n`);
    console.log(`[sync-app-version] app.json → ${pkg.version}`);
} else {
    console.log(`[sync-app-version] already ${pkg.version}`);
}
