import type * as PdfJs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PlatformImage } from '../monetization/platformAi';

// Copied by scripts/copy-pdfjs.js. pdf.js can't go through Metro: its `import.meta`
// is a syntax error in a classic script and would break the main bundle.
const PDFJS_URL = '/vendor/pdfjs/pdf.min.js';
const PDFJS_WORKER_URL = '/vendor/pdfjs/pdf.worker.min.js';

type PdfWindow = Window & {
    __afPdfjs?: Promise<typeof PdfJs>;
    __afPdfjsLoaded?: (mod: typeof PdfJs) => void;
    __afPdfjsFailed?: () => void;
};

function loadPdfjs(): Promise<typeof PdfJs> {
    const w = window as PdfWindow;
    if (!w.__afPdfjs) {
        w.__afPdfjs = new Promise<typeof PdfJs>((resolve, reject) => {
            w.__afPdfjsLoaded = (mod) => {
                mod.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
                resolve(mod);
            };
            w.__afPdfjsFailed = () => reject(new Error("Couldn't load the PDF reader. Check your connection and try again."));
            const script = document.createElement('script');
            script.type = 'module';
            script.textContent = `import('${PDFJS_URL}').then((m) => window.__afPdfjsLoaded(m), () => window.__afPdfjsFailed());`;
            document.head.appendChild(script);
        }).catch((error) => {
            w.__afPdfjs = undefined;
            throw error;
        });
    }
    return w.__afPdfjs;
}

/** Extract PDF text with pdf.js; render up to a few pages as JPEG when text is sparse. */
export async function preparePdfFromBytes(bytes: Uint8Array, name: string): Promise<{ text: string; pageImages: PlatformImage[] }> {
    const pdfjs = await loadPdfjs();

    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const pageImages: PlatformImage[] = [];
    let text = '';
    const maxPages = Math.min(doc.numPages, 12);
    for (let pageNum = 1; pageNum <= maxPages; pageNum += 1) {
        const page = await doc.getPage(pageNum);
        const content = await page.getTextContent();
        const pageText = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
        if (pageText.trim()) text += `${pageText.trim()}\n\n`;

        // If this page has little text (scanned recipe), include a page image for vision.
        if (pageText.trim().length < 80 && pageImages.length < 4) {
            const viewport = page.getViewport({ scale: 1.4 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                await page.render({ canvasContext: ctx, viewport }).promise;
                const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
                const base64 = dataUrl.split(',')[1];
                if (base64) pageImages.push({ data: base64, mimeType: 'image/jpeg' });
            }
        }
    }
    if (!text.trim() && !pageImages.length) {
        text = `[PDF "${name}" had no extractable text.]`;
    }
    return { text: text.trim(), pageImages };
}
