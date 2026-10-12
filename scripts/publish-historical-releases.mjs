#!/usr/bin/env node
/**
 * Create annotated git tags and GitHub releases from CHANGELOG.md + release boundaries.
 * Safe to re-run: skips tags that already exist.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const root = path.resolve(import.meta.dirname, '..');

/** Last merged PR in each milestone (annotated tag points at this commit). */
const RELEASE_COMMITS = [
    { version: '0.1.0', sha: '92ca14d4cc235458a02c579f50e64f69d9147ef3' },
    { version: '0.2.0', sha: '677f71ca86ac086e1bc0caea5aaa98edd725fb90' },
    { version: '0.3.0', sha: '7c0838a7193e6754d46b831981d2c2a924a8f304' },
    { version: '0.4.0', sha: 'cf934466bc760eeef5700607739fd28523081a94' },
    { version: '0.5.0', sha: '6b40bffd62fd94c6fcd76381e917e83790035d06' },
    { version: '0.6.0', sha: '670237288af769874e091033fae1daaff5586eb8' },
    { version: '0.7.0', sha: 'a0199bf74c5aaf270ce799489a4ec404a0f9c5f0' },
    { version: '0.8.0', sha: '62243e2488cba1a1a08cced3925d26972af1bce3' },
    { version: '0.9.0', sha: '942c5a02d734fdd3e2d01e44a0101b5ef03424da' }, // #52
    { version: '0.10.0', sha: '1dc4c7dce3a7065a1f33f23b15c1ddc643f552f1' },
    { version: '0.11.0', sha: '9f0a7b618bf4b3583d8eca207ab6b3b42d080d4a' },
    { version: '0.12.0', sha: '074b8cc2570a28ceaa1a1fcfdfacfd38bbd2044b' },
    { version: '0.13.0', sha: '8fb321dd019deeba59c7e6818281f65107fc81f0' },
    { version: '1.0.0', sha: '2b315ef6804d66999ae983971c1ecf11498a934f' },
];

function notesForVersion(version) {
    const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    const match = changelog.match(new RegExp(`## \\[${version.replace(/\./g, '\\.')}\\][^#]*`, 's'));
    if (!match) return `Release ${version}`;
    return match[0]
        .replace(/^## \[[^\]]+\](?:\s*-\s*\d{4}-\d{2}-\d{2})?\s*/m, '')
        .trim();
}

function existingTags() {
    try {
        return new Set(
            execSync('git tag -l', { cwd: root, encoding: 'utf8' })
                .split('\n')
                .map((t) => t.trim())
                .filter(Boolean)
        );
    } catch {
        return new Set();
    }
}

const tags = existingTags();

for (const { version, sha } of RELEASE_COMMITS) {
    const tag = `v${version}`;
    if (!tags.has(tag)) {
        const notes = notesForVersion(version);
        execSync(`git tag -a "${tag}" -m "AmpliFood ${version}" ${sha}`, { cwd: root, stdio: 'inherit' });
        console.log(`[publish] tagged ${tag} @ ${sha.slice(0, 7)}`);
    } else {
        console.log(`[publish] skip existing tag ${tag}`);
    }
}

for (const { version, sha } of RELEASE_COMMITS) {
    const tag = `v${version}`;
    const notes = notesForVersion(version);
    try {
        execSync(`gh release view "${tag}"`, { cwd: root, stdio: 'pipe' });
        console.log(`[publish] GitHub release ${tag} already exists`);
    } catch {
        const notesFile = path.join(root, '.release-notes-tmp.md');
        fs.writeFileSync(notesFile, notes);
        execSync(
            `gh release create "${tag}" --target "${sha}" --title "AmpliFood ${version}" --notes-file "${notesFile}"`,
            { cwd: root, stdio: 'inherit' }
        );
        fs.unlinkSync(notesFile);
        console.log(`[publish] created GitHub release ${tag}`);
    }
}
