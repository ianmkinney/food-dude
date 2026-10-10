// Module hooks for running app TypeScript under plain Node in scripts/test-*.mjs:
// extensionless imports resolve to .ts/.js, TypeScript is type-stripped, JSON
// loads as a default export, and native/device modules map to a stub file.
import { existsSync, readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

let stubUrl = null;
let stubbed = [];

export async function initialize(data) {
    stubUrl = data.stubUrl;
    stubbed = data.stubbed;
}

const EXTENSIONS = ['.ts', '.tsx', '.js', '/index.ts', '/index.js'];

function isStubbed(specifier, resolvedPath) {
    return stubbed.some((entry) =>
        entry.startsWith('src/') ? resolvedPath?.replace(/\.(ts|tsx|js)$/, '').endsWith(entry) : entry === specifier
    );
}

export async function resolve(specifier, context, nextResolve) {
    if (isStubbed(specifier, null)) return { url: stubUrl, shortCircuit: true };
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
        const base = fileURLToPath(new URL(specifier, context.parentURL));
        const candidates = /\.(ts|tsx|js|mjs|json)$/.test(base) ? [base] : EXTENSIONS.map((ext) => base + ext);
        const found = candidates.find((path) => existsSync(path));
        if (found) {
            if (isStubbed(specifier, found)) return { url: stubUrl, shortCircuit: true };
            return { url: pathToFileURL(found).href, shortCircuit: true };
        }
    }
    return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
    if (/\.tsx?$/.test(url)) {
        const source = stripTypeScriptTypes(readFileSync(fileURLToPath(url), 'utf8'));
        return { format: 'module', source, shortCircuit: true };
    }
    if (url.endsWith('.json')) {
        return { format: 'module', source: `export default ${readFileSync(fileURLToPath(url), 'utf8')};`, shortCircuit: true };
    }
    return nextLoad(url, context);
}
