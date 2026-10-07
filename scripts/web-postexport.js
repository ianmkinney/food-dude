#!/usr/bin/env node
/**
 * Make `dist/` safe to upload to any static host.
 *
 * Metro exports package assets (Ionicons font, wa-sqlite.wasm, navigation
 * icons) under `dist/assets/node_modules/...`. Several upload paths silently
 * drop anything named `node_modules` (Vercel CLI uploads of a local folder,
 * Netlify drag-and-drop, Cloudflare Pages, Firebase), which leaves the app
 * without icons and without its database. This renames those folders to `nm`
 * and rewrites the matching URLs inside the exported bundles.
 */
const fs = require('fs');
const path = require('path');

const dist = path.resolve(process.argv[2] || 'dist');
const assetsDir = path.join(dist, 'assets');

if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.error(`[web-postexport] ${dist}/index.html not found; run "expo export --platform web" first.`);
    process.exit(1);
}

function renameNodeModulesDirs(dir) {
    if (!fs.existsSync(dir)) return 0;
    let renamed = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const full = path.join(dir, entry.name);
        renamed += renameNodeModulesDirs(full);
        if (entry.name === 'node_modules') {
            fs.renameSync(full, path.join(dir, 'nm'));
            renamed += 1;
        }
    }
    return renamed;
}

function listFiles(dir, exts) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return listFiles(full, exts);
        return exts.includes(path.extname(entry.name)) ? [full] : [];
    });
}

const renamedDirs = renameNodeModulesDirs(assetsDir);

let rewrittenFiles = 0;
for (const file of [...listFiles(path.join(dist, '_expo'), ['.js', '.css', '.map']), ...listFiles(dist, ['.html'])]) {
    const source = fs.readFileSync(file, 'utf8');
    const next = source.replace(/\/assets\/[^"'`\s)]*/g, (url) => url.replace(/(^|\/)node_modules(?=\/)/g, '$1nm'));
    if (next !== source) {
        fs.writeFileSync(file, next);
        rewrittenFiles += 1;
    }
}

const leftovers = listFiles(dist, ['.js', '.html']).filter((file) =>
    /\/assets\/[^"'`\s)]*node_modules\//.test(fs.readFileSync(file, 'utf8'))
);
if (leftovers.length) {
    console.error('[web-postexport] asset URLs still point into node_modules:', leftovers);
    process.exit(1);
}

console.log(`[web-postexport] renamed ${renamedDirs} node_modules folder(s), rewrote ${rewrittenFiles} file(s) in ${dist}`);
