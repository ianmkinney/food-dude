#!/usr/bin/env node
/**
 * Copy pdf.js (plus a tiny loader module) into public/vendor/pdfjs so the web
 * app can load it as a real ES module at runtime. pdf.js uses `import.meta`, which is a syntax error in
 * Metro's classic-script bundles and would stop the whole app from booting.
 * Files are saved as .js so every static host serves a JavaScript MIME type.
 */
const fs = require('fs');
const path = require('path');

const src = path.dirname(require.resolve('pdfjs-dist/legacy/build/pdf.min.mjs'));
const out = path.resolve(__dirname, '..', 'public', 'vendor', 'pdfjs');
fs.mkdirSync(out, { recursive: true });
for (const [from, to] of [
    ['pdf.min.mjs', 'pdf.min.js'],
    ['pdf.worker.min.mjs', 'pdf.worker.min.js'],
]) {
    fs.copyFileSync(path.join(src, from), path.join(out, to));
}
// An external module (not an inline script) so it passes CSP `script-src 'self'`.
fs.writeFileSync(path.join(out, 'loader.js'), "import * as pdfjs from './pdf.min.js';\nwindow.__afPdfjsLoaded(pdfjs);\n");
console.log(`[copy-pdfjs] copied pdf.js to ${path.relative(process.cwd(), out)}`);
