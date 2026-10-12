#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'src', 'generated');
const outFile = path.join(outDir, 'buildMetadata.json');

function gitShortSha() {
    try {
        return execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
    } catch {
        return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev';
    }
}

const payload = {
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || gitShortSha(),
    buildDate: new Date().toISOString(),
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`[inject-build-metadata] ${payload.gitCommit} @ ${payload.buildDate}`);
