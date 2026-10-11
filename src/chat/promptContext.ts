import { chatOperations, memoryOperations } from '../database/operations';
import { generateText } from '../services/aiClient';
import { isMemoryEnabled } from '../memory/memorySettings';
import { CHAT_THREAD_AMPI, CHAT_THREAD_AI_CHEF } from './chatThreads';

export type ChatImage = { data: string; mimeType: string };

export type ChatTurn = {
    role: 'user' | 'sous' | 'assistant';
    text: string;
    images?: ChatImage[];
};

function parseChatImages(metaJson: string | null | undefined): ChatImage[] | undefined {
    if (!metaJson) return undefined;
    try {
        const meta = JSON.parse(metaJson) as { chat_images?: ChatImage[] };
        if (Array.isArray(meta.chat_images) && meta.chat_images.length) return meta.chat_images;
    } catch {
        // ignore
    }
    return undefined;
}

export async function loadThreadTurns(threadId: string, limit = 24): Promise<{ history: ChatTurn[]; summary: string }> {
    const rows = await chatOperations.getRecent(threadId, limit);
    const summary = await chatOperations.getSummary(threadId);
    const history = rows.map((row: { role: string; text: string; meta_json?: string | null }) => ({
        role: row.role === 'assistant' ? 'assistant' : row.role === 'sous' ? 'sous' : 'user',
        text: row.text,
        images: row.role === 'user' ? parseChatImages(row.meta_json) : undefined,
    }));
    return { history, summary };
}

export async function persistAmpiExchange(
    userText: string,
    sousText: string,
    sousMeta: object | null = null,
    userMeta: object | null = null
) {
    await chatOperations.addMessage(CHAT_THREAD_AMPI, { role: 'user', text: userText, meta: userMeta });
    await chatOperations.addMessage(CHAT_THREAD_AMPI, { role: 'sous', text: sousText, meta: sousMeta });
    await refreshThreadSummary(CHAT_THREAD_AMPI);
}

async function refreshThreadSummary(threadId: string) {
    const rows = await chatOperations.getRecent(threadId, 48);
    if (rows.length < 18) return;
    const older = rows.slice(0, -14).map((r: { role: string; text: string }) => `${r.role}: ${r.text}`).join('\n');
    try {
        const summary = await generateText(
            `Summarize this cooking-app chat in under 90 words for future context. Keep facts the user stated (preferences, household, equipment). No advice.\n\n${older}`,
            { feature: 'chat' }
        );
        await chatOperations.setSummary(threadId, summary.trim());
    } catch {
        const local = rows.slice(0, -14).map((r: { text: string }) => r.text).join(' · ').slice(0, 400);
        await chatOperations.setSummary(threadId, local);
    }
}

export async function memoriesForPrompt(userMessage: string): Promise<string> {
    if (!(await isMemoryEnabled())) return '';
    const all = (await memoryOperations.list()) as { fact: string; category: string }[];
    if (!all.length) return '';
    const words = userMessage.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const scored = all.map((m) => {
        const f = m.fact.toLowerCase();
        const score = words.reduce((s, w) => s + (f.includes(w) ? 1 : 0), 0);
        return { m, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const withHits = scored.filter((x) => x.score > 0).slice(0, 12);
    const picked = withHits.length ? withHits : scored.slice(0, 8);
    return picked.map((x) => `- (${x.m.category}) ${x.m.fact}`).join('\n');
}

export { CHAT_THREAD_AI_CHEF };
