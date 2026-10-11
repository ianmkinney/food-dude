// A small Markdown subset for chat bubbles: paragraphs, headings, bullet and
// numbered lists, block quotes, code, bold, italics, inline code and links.
// It only ever produces this tree; raw HTML stays literal text.

export type Inline =
    | { type: 'text'; text: string }
    | { type: 'bold'; children: Inline[] }
    | { type: 'italic'; children: Inline[] }
    | { type: 'strike'; children: Inline[] }
    | { type: 'code'; text: string }
    | { type: 'link'; href: string; children: Inline[] };

export type ListItem = { marker: string; content: Inline[] };

export type Block =
    | { type: 'paragraph'; content: Inline[] }
    | { type: 'heading'; level: number; content: Inline[] }
    | { type: 'list'; ordered: boolean; items: ListItem[] }
    | { type: 'quote'; content: Inline[] }
    | { type: 'code'; text: string }
    | { type: 'rule' };

const SAFE_PROTOCOL = /^(https?:|mailto:)/i;

/** Only web and mail links are clickable; anything else (javascript:, data:, relative) stays text. */
export function safeHref(raw: string): string | null {
    const href = raw.trim().replace(/^<|>$/g, '');
    if (!SAFE_PROTOCOL.test(href)) return null;
    try {
        const url = new URL(href);
        return url.protocol === 'mailto:' || url.hostname ? url.href : null;
    } catch {
        return null;
    }
}

const INLINE = new RegExp(
    [
        '`([^`\\n]+)`', // 1 code
        '\\[([^\\]\\n]+)\\]\\(([^)\\s]+)(?:\\s+"[^"]*")?\\)', // 2 text, 3 url
        '\\*\\*(?=\\S)([\\s\\S]*?\\S)\\*\\*', // 4 bold
        '__(?=\\S)([\\s\\S]*?\\S)__', // 5 bold
        '~~(?=\\S)([\\s\\S]*?\\S)~~', // 6 strike
        '(?<![\\w*])\\*(?=[^\\s*])([^*\\n]*?[^\\s*])\\*(?![\\w*])', // 7 italic
        '(?<!\\w)_(?=\\S)([^_\\n]*?\\S)_(?!\\w)', // 8 italic
        '(https?:\\/\\/[^\\s<>()]+[^\\s<>().,!?;:\'"])', // 9 bare url
    ].join('|'),
    'g'
);

export function parseInline(text: string): Inline[] {
    const out: Inline[] = [];
    const pushText = (value: string) => {
        if (!value) return;
        const last = out[out.length - 1];
        if (last?.type === 'text') last.text += value;
        else out.push({ type: 'text', text: value });
    };
    let index = 0;
    INLINE.lastIndex = 0;
    for (let match = INLINE.exec(text); match; match = INLINE.exec(text)) {
        pushText(text.slice(index, match.index));
        index = match.index + match[0].length;
        const [whole, code, linkText, linkUrl, bold1, bold2, strike, ital1, ital2, bare] = match;
        if (code !== undefined) out.push({ type: 'code', text: code });
        else if (linkText !== undefined) {
            const href = safeHref(linkUrl);
            const children = parseInline(linkText);
            if (href) out.push({ type: 'link', href, children });
            else children.forEach((child) => (child.type === 'text' ? pushText(child.text) : out.push(child)));
        } else if (bold1 !== undefined || bold2 !== undefined) out.push({ type: 'bold', children: parseInline(bold1 ?? bold2) });
        else if (strike !== undefined) out.push({ type: 'strike', children: parseInline(strike) });
        else if (ital1 !== undefined || ital2 !== undefined) out.push({ type: 'italic', children: parseInline(ital1 ?? ital2) });
        else if (bare !== undefined) {
            const href = safeHref(bare);
            if (href) out.push({ type: 'link', href, children: [{ type: 'text', text: bare }] });
            else pushText(whole);
        } else pushText(whole);
        INLINE.lastIndex = index;
    }
    pushText(text.slice(index));
    return out;
}

const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s{0,3}[-*+•]\s+(.*)$/;
const ORDERED = /^\s{0,3}(\d{1,3})[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const FENCE = /^\s{0,3}```/;
const RULE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;

export function parseMarkdown(source: string): Block[] {
    const lines = source.replace(/\r\n?/g, '\n').split('\n');
    const blocks: Block[] = [];
    let paragraph: string[] = [];
    let list: { ordered: boolean; items: { marker: string; lines: string[] }[] } | null = null;
    let quote: string[] = [];

    const flushParagraph = () => {
        if (paragraph.length) blocks.push({ type: 'paragraph', content: parseInline(paragraph.join('\n')) });
        paragraph = [];
    };
    const flushList = () => {
        if (list) {
            blocks.push({
                type: 'list',
                ordered: list.ordered,
                items: list.items.map((item) => ({ marker: item.marker, content: parseInline(item.lines.join('\n')) })),
            });
        }
        list = null;
    };
    const flushQuote = () => {
        if (quote.length) blocks.push({ type: 'quote', content: parseInline(quote.join('\n')) });
        quote = [];
    };
    const flushAll = () => {
        flushParagraph();
        flushList();
        flushQuote();
    };

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (FENCE.test(line)) {
            flushAll();
            const code: string[] = [];
            for (i += 1; i < lines.length && !FENCE.test(lines[i]); i += 1) code.push(lines[i]);
            blocks.push({ type: 'code', text: code.join('\n') });
            continue;
        }
        if (!line.trim()) {
            // A blank line ends a paragraph or quote; lists survive it so
            // "1. … (blank) 2. …" stays one list.
            flushParagraph();
            flushQuote();
            continue;
        }
        if (RULE.test(line)) {
            flushAll();
            blocks.push({ type: 'rule' });
            continue;
        }
        const heading = HEADING.exec(line);
        if (heading) {
            flushAll();
            blocks.push({ type: 'heading', level: heading[1].length, content: parseInline(heading[2]) });
            continue;
        }
        const bullet = BULLET.exec(line);
        const ordered = bullet ? null : ORDERED.exec(line);
        if (bullet || ordered) {
            flushParagraph();
            flushQuote();
            const isOrdered = Boolean(ordered);
            if (!list || list.ordered !== isOrdered) {
                flushList();
                list = { ordered: isOrdered, items: [] };
            }
            list.items.push({ marker: ordered ? `${ordered[1]}.` : '•', lines: [(bullet ? bullet[1] : ordered![2]).trim()] });
            continue;
        }
        const quoted = QUOTE.exec(line);
        if (quoted) {
            flushParagraph();
            flushList();
            quote.push(quoted[1]);
            continue;
        }
        if (list && /^\s+\S/.test(line) && list.items.length) {
            list.items[list.items.length - 1].lines.push(line.trim());
            continue;
        }
        flushList();
        flushQuote();
        paragraph.push(line.trim());
    }
    flushAll();
    return blocks;
}
