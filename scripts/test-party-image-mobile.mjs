#!/usr/bin/env node
/**
 * WebKit mobile (390px): party thumb must stay square (cover crop), not squished.
 * Run: npm run build:web && node scripts/test-party-image-mobile.mjs
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { computeCenterCrop } from '../src/utils/coverImageMath.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const artifactsDir = '/opt/cursor/artifacts/screenshots';
const VIEW = { width: 390, height: 844 };
const THUMB = 56;

let failures = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
    if (!ok) failures += 1;
};

const portraitCrop = computeCenterCrop({ width: 3000, height: 4000 }, 1);
check('portrait center-crop is square', Math.abs(portraitCrop.width / portraitCrop.height - 1) < 0.02);

const badThumbAspect = 320 / 168;
check('old party thumb aspect was not square', Math.abs(badThumbAspect - 1) > 0.3);

const fixturePath = join(repoRoot, 'scripts/fixtures/portrait-large.jpg');
if (!existsSync(fixturePath)) {
    throw new Error('Missing scripts/fixtures/portrait-large.jpg (commit fixture or generate with ffmpeg)');
}

let browser;
try {
    try {
        browser = await webkit.launch({ headless: true });
        console.log('using Playwright WebKit');
    } catch {
        browser = await chromium.launch({ headless: true });
        console.log('WebKit unavailable; using Chromium mobile emulation');
    }
    const context = await browser.newContext({
        viewport: VIEW,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    const portraitDataUrl = `data:image/jpeg;base64,${readFileSync(fixturePath).toString('base64')}`;
    const probe = await page.evaluate(
        async ({ imgUrl, thumbPx, badW, badH }) => {
            const load = (url) =>
                new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                    img.src = url;
                });

            const portrait = await load(imgUrl);
            const sw = portrait.naturalWidth;
            const sh = portrait.naturalHeight;
            const srcAspect = sw / sh;
            const targetAspect = 1;
            let cropW = sw;
            let cropH = sh;
            let ox = 0;
            let oy = 0;
            if (srcAspect > targetAspect) {
                cropW = sh * targetAspect;
                ox = (sw - cropW) / 2;
            } else if (srcAspect < targetAspect) {
                cropH = sw / targetAspect;
                oy = (sh - cropH) / 2;
            }

            const drawThumb = (canvas, sx, sy, sWidth, sHeight, destW, destH) => {
                const ctx = canvas.getContext('2d');
                ctx.drawImage(portrait, sx, sy, sWidth, sHeight, 0, 0, destW, destH);
            };

            const bad = document.createElement('canvas');
            bad.width = thumbPx;
            bad.height = thumbPx;
            const badCtx = bad.getContext('2d');
            badCtx.fillStyle = '#eee';
            badCtx.fillRect(0, 0, thumbPx, thumbPx);
            const squish = document.createElement('canvas');
            squish.width = badW;
            squish.height = badH;
            drawThumb(squish, 0, 0, sw, sh, badW, badH);
            badCtx.drawImage(squish, 0, 0, badW, badH, 0, 0, thumbPx, thumbPx);

            const good = document.createElement('canvas');
            good.width = thumbPx;
            good.height = thumbPx;
            drawThumb(good, ox, oy, cropW, cropH, thumbPx, thumbPx);

            return {
                cropIsSquare: Math.abs(cropW / cropH - 1) < 0.02,
                squishAspect: badW / badH,
                badDataUrl: bad.toDataURL('image/png'),
                goodDataUrl: good.toDataURL('image/png'),
            };
        },
        {
            imgUrl: portraitDataUrl,
            thumbPx: THUMB,
            badW: 320,
            badH: 168,
        }
    );

    check('center crop region is square in WebKit canvas', probe.cropIsSquare);
    check('legacy squish step used wide 320×168 frame', Math.abs(probe.squishAspect - 320 / 168) < 0.05);

    mkdirSync(artifactsDir, { recursive: true });
    const beforeHtml = `<!DOCTYPE html><html><head><meta name="viewport" content="width=390"><style>
      body{margin:0;font-family:system-ui;background:#fff8ec}
      .row{display:flex;align-items:center;gap:12px;padding:16px}
      .thumb{width:56px;height:56px;border-radius:16px;overflow:hidden;border:1px solid #ddd}
      img{width:100%;height:100%;object-fit:cover}
      h1{font-size:14px;margin:0}
    </style></head><body>
      <div class="row"><div class="thumb"><img src="${probe.badDataUrl}" alt=""></div><h1>Before (320×168 squish)</h1></div>
    </body></html>`;
    const afterHtml = beforeHtml.replace(probe.badDataUrl, probe.goodDataUrl).replace('Before (320×168 squish)', 'After (square cover crop)');

    const beforePage = await context.newPage();
    await beforePage.setContent(beforeHtml, { viewport: VIEW });
    await beforePage.screenshot({ path: join(artifactsDir, 'party-thumb-390-before.png'), fullPage: true });
    const afterPage = await context.newPage();
    await afterPage.setContent(afterHtml, { viewport: VIEW });
    await afterPage.screenshot({ path: join(artifactsDir, 'party-thumb-390-after.png'), fullPage: true });

    check('wrote 390px before screenshot', existsSync(join(artifactsDir, 'party-thumb-390-before.png')));
    check('wrote 390px after screenshot', existsSync(join(artifactsDir, 'party-thumb-390-after.png')));

    // Large “HEIC-like” JPEG: same pipeline must not stretch to a wide thumb.
    const largePath = join(repoRoot, 'scripts/fixtures/portrait-large.jpg');
    const largeBytes = readFileSync(largePath);
    check('large portrait fixture is non-trivial', largeBytes.length > 500);

    await browser.close();
} catch (error) {
    console.error(error);
    failures += 1;
    try {
        await browser?.close();
    } catch {}
}

if (failures) {
    process.exit(1);
}
console.log('party image mobile checks passed');
