#!/usr/bin/env node
/**
 * Bump package.json version, sync app.json, refresh changelog bundle.
 *
 * Usage:
 *   npm run release -- patch|minor|major
 *   npm run release -- 1.2.3
 *
 * After bumping, edit CHANGELOG.md (add [x.y.z] section), then commit and tag:
 *   git tag -a vX.Y.Z -m "vX.Y.Z"
 *   git push origin main --tags
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const root = path.resolve(import.meta.dirname, '..');
const bump = process.argv[2];

if (!bump) {
    console.error('Usage: npm run release -- patch|minor|major|<version>');
    process.exit(1);
}

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const parts = pkg.version.split('.').map((n) => Number.parseInt(n, 10));

function nextVersion(kind) {
    if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
    const [major, minor, patch] = parts;
    if (kind === 'major') return `${major + 1}.0.0`;
    if (kind === 'minor') return `${major}.${minor + 1}.0`;
    if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
    throw new Error(`Unknown bump: ${kind}`);
}

const next = nextVersion(bump);
pkg.version = next;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

execSync('node scripts/sync-app-version.mjs', { cwd: root, stdio: 'inherit' });
execSync('node scripts/bundle-changelog.mjs', { cwd: root, stdio: 'inherit' });

console.log(`\n[release] Bumped to ${next}. Add a ## [${next}] section to CHANGELOG.md, then commit and tag v${next}.`);
