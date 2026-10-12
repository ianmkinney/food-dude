#!/usr/bin/env node
/**
 * Parse CHANGELOG.md into src/generated/changelog.json for in-app release notes.
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const changelogPath = path.join(root, 'CHANGELOG.md');
const outDir = path.join(root, 'src', 'generated');
const outFile = path.join(outDir, 'changelog.json');

const source = fs.readFileSync(changelogPath, 'utf8');
const releases = [];

const sections = source.split(/\n(?=## \[)/);
for (const section of sections) {
    const header = section.match(/^## \[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?/);
    if (!header) continue;
    const version = header[1].trim();
    if (version.toLowerCase() === 'unreleased') continue;
    const date = header[2]?.trim() || '';
    const body = section
        .replace(/^## \[[^\]]+\](?:\s*-\s*\d{4}-\d{2}-\d{2})?\s*/m, '')
        .trim();
    releases.push({ version, date, body });
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify({ releases }, null, 2)}\n`);
console.log(`[bundle-changelog] ${releases.length} releases → ${path.relative(root, outFile)}`);
