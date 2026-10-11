import { chatOperations } from '../database/operations';
import { CHAT_THREAD_AMPI } from '../chat/chatThreads';

/**
 * Preloads a tall Ampi thread for Playwright scroll tests.
 * Gated by `globalThis.__AMPI_SCROLL_TEST__`.
 */
export async function runAmpiScrollTestSeed() {
    await chatOperations.clearThread(CHAT_THREAD_AMPI);
    for (let i = 0; i < 28; i++) {
        await chatOperations.addMessage(CHAT_THREAD_AMPI, {
            role: 'user',
            text: `Scroll test user line ${i + 1} — ${'x'.repeat(40)}`,
        });
        await chatOperations.addMessage(CHAT_THREAD_AMPI, {
            role: 'sous',
            text: `Scroll test reply ${i + 1} with enough text to grow the list.\n\n- bullet one\n- bullet two`,
        });
    }
    console.log('[demo] Ampi scroll test seed ready');
}
