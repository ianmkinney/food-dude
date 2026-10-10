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
const { buildShell } = require('./web-shell');

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

// The Fredoka headings are only discovered once the bundle has downloaded and
// run; preloading lets them download alongside it. (The wa-sqlite wasm is
// fetched inside a worker, which can't use a document preload.)
const PRELOADS = [
    { test: /\/Fredoka_(600SemiBold|700Bold)\.[^/]*\.ttf$/, as: 'font', type: 'font/ttf' },
];
const indexHtml = path.join(dist, 'index.html');
const assetUrls = listFiles(assetsDir, ['.ttf']).map((file) => '/' + path.relative(dist, file).split(path.sep).join('/'));
const links = PRELOADS.flatMap(({ test, as, type }) =>
    assetUrls.filter((url) => test.test(url)).map((url) => `<link rel="preload" href="${url}" as="${as}" type="${type}" crossorigin>`)
);
let html = fs.readFileSync(indexHtml, 'utf8');
// Injected after first paint so the downloads don't compete with the shell.
if (links.length && !html.includes('id="af-preload"')) {
    const tags = JSON.stringify(links.join(''));
    html = html.replace(
        '</head>',
        `<script id="af-preload">requestAnimationFrame(function(){setTimeout(function(){document.head.insertAdjacentHTML('beforeend',${tags})},0)})</script></head>`
    );
}
// Run the bundle after the first frame. A cached bundle could otherwise
// evaluate before the shell paints and hold up the first paint; preload links
// keep the download starting at parse time. The timeout covers background tabs,
// where requestAnimationFrame doesn't fire.
const BUNDLE_TAG = /<script src="(\/_expo\/static\/js\/web\/[^"]+\.js)" defer><\/script>/g;
const bundles = [...html.matchAll(BUNDLE_TAG)].map((match) => match[1]);
if (bundles.length && !html.includes('id="af-boot"')) {
    html = html.replace(BUNDLE_TAG, '');
    html = html.replace('</head>', bundles.map((src) => `<link rel="preload" href="${src}" as="script">`).join('') + '</head>');
    const boot =
        `<script id="af-boot">(function(){var started=false;function boot(){if(started)return;started=true;` +
        `${JSON.stringify(bundles)}.forEach(function(src){var s=document.createElement('script');s.src=src;s.async=false;document.body.appendChild(s)})}` +
        `requestAnimationFrame(function(){setTimeout(boot,0)});setTimeout(boot,250)})()</script>`;
    html = html.replace('</body>', `${boot}</body>`);
}
const fredokaBold = assetUrls.find((url) => /\/Fredoka_700Bold\.[^/]*\.ttf$/.test(url));
const fontFaces = fredokaBold ? `@font-face{font-family:Fredoka_700Bold;src:url(${fredokaBold}) format('truetype');font-display:swap}` : '';
html = html.replace('<!--af-shell-->', buildShell({ fontFaces }));
fs.writeFileSync(indexHtml, html);

console.log(`[web-postexport] renamed ${renamedDirs} node_modules folder(s), rewrote ${rewrittenFiles} file(s), preloaded ${links.length} asset(s) in ${dist}`);
