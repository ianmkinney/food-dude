import { getOpenRouterConfig } from './env.js';

const VIDEO_MODEL =
    process.env.OPENROUTER_RECIPE_VIDEO_MODEL || 'google/gemini-2.5-flash';

const RECIPE_JSON_PROMPT = `You are a recipe extraction expert. Watch this cooking video (speech + on-screen text).
Extract a complete recipe. Return ONLY valid JSON (no markdown):
{
  "title": "string",
  "description": "string or null",
  "servings": number or null,
  "prepTime": minutes or null,
  "cookTime": minutes or null,
  "totalTime": minutes or null,
  "ingredients": ["full ingredient line 1", "line 2"],
  "steps": ["step 1", "step 2"]
}
If you cannot find a real recipe, return {"title": null, "ingredients": [], "steps": []}.`;

function stripFences(text) {
    let cleaned = String(text || '').trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    return cleaned.trim();
}

function buildVideoMessages({ mimeType, base64, extraContext }) {
    const dataUrl = `data:${mimeType};base64,${base64}`;
    const text = extraContext ? `${RECIPE_JSON_PROMPT}\n\nContext:\n${extraContext}` : RECIPE_JSON_PROMPT;
    const videoPart = { type: 'video_url', video_url: { url: dataUrl } };
    const imagePart = { type: 'image_url', image_url: { url: dataUrl } };
    return [
        {
            role: 'user',
            content: [
                { type: 'text', text },
                videoPart,
            ],
        },
    ];
}

async function openRouterComplete({ apiKey, model, messages, maxTokens = 4096 }) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://amplifood.vercel.app',
            'X-Title': 'AmpliFood',
        },
        body: JSON.stringify({
            model,
            messages,
            max_tokens: maxTokens,
            stream: false,
        }),
    });
    const raw = await response.text().catch(() => '');
    if (!response.ok) {
        const err = new Error(`openrouter_${response.status}`);
        err.status = response.status;
        err.body = raw.slice(0, 400);
        throw err;
    }
    let json;
    try {
        json = JSON.parse(raw);
    } catch {
        throw new Error('openrouter_bad_json');
    }
    const text = json?.choices?.[0]?.message?.content;
    if (!text) throw new Error('openrouter_empty');
    return String(text);
}

/**
 * Try native video_url, then image_url data-URI (frame-style; no audio on server).
 * @returns {{ recipe: object, method: 'video' | 'frames_fallback', audioUsed: boolean }}
 */
export async function extractRecipeFromVideoBase64({ apiKey, mimeType, base64, extraContext }) {
    const { defaultModel, fallbackModels } = getOpenRouterConfig();
    const models = [VIDEO_MODEL, defaultModel, ...fallbackModels.filter((m) => m !== VIDEO_MODEL && m !== defaultModel)];

    let lastError;
    for (const model of models) {
        for (const mode of ['video', 'frames_fallback']) {
            try {
                const messages =
                    mode === 'video'
                        ? buildVideoMessages({ mimeType, base64, extraContext })
                        : [
                              {
                                  role: 'user',
                                  content: [
                                      {
                                          type: 'text',
                                          text: `${RECIPE_JSON_PROMPT}\n\nNote: Video bytes were sent as a single image frame; audio is not available on the server. Use visible on-screen text only.\n\n${extraContext || ''}`,
                                      },
                                      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
                                  ],
                              },
                          ];
                const text = await openRouterComplete({ apiKey, model, messages });
                const parsed = JSON.parse(stripFences(text));
                if (!parsed?.title || !Array.isArray(parsed.ingredients) || !parsed.ingredients.length) {
                    throw new Error('no_recipe_in_video');
                }
                return {
                    recipe: parsed,
                    method: mode === 'video' ? 'video' : 'frames_fallback',
                    audioUsed: mode === 'video',
                    model,
                };
            } catch (error) {
                lastError = error;
                if (mode === 'video' && (error?.status === 400 || error?.status === 404)) {
                    continue;
                }
            }
        }
    }
    throw lastError || new Error('video_extract_failed');
}
