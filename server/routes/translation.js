const express = require('express');

const MAX_TEXTS = 100;
const MAX_TEXT_LENGTH = 1000;

function createTranslationRouter({
    apiKey = process.env.DEEPL_API_KEY,
    apiUrl = 'https://api-free.deepl.com'
} = {}) {
    const router = express.Router();
    const translationCache = new Map();

    router.post('/api/translate', async (req, res) => {
        const { texts, targetLang } = req.body || {};
        if (!Array.isArray(texts) || texts.length === 0 || texts.length > MAX_TEXTS
            || texts.some(text => typeof text !== 'string' || text.length === 0 || text.length > MAX_TEXT_LENGTH)
            || typeof targetLang !== 'string' || !/^[a-z]{2,8}(?:-[A-Z]{2})?$/.test(targetLang)) {
            return res.status(400).json({
                error: `texts must contain 1-${MAX_TEXTS} strings of up to ${MAX_TEXT_LENGTH} characters and targetLang must be a valid language code.`
            });
        }

        res.set('Cache-Control', 'no-store');
        if (targetLang === 'en') {
            return res.json({ translations: texts });
        }
        if (!apiKey) {
            return res.status(503).json({ error: 'Translation service is not configured.' });
        }

        try {
            const translations = new Array(texts.length);
            const pendingTexts = [];
            const pendingIndices = [];

            texts.forEach((text, index) => {
                const cacheKey = `${targetLang}:${text}`;
                const cached = translationCache.get(cacheKey);
                if (cached !== undefined) {
                    translations[index] = cached;
                } else {
                    pendingTexts.push(text);
                    pendingIndices.push(index);
                }
            });

            if (pendingTexts.length > 0) {
                let response;
                let data;
                for (let attempt = 0; attempt < 3; attempt++) {
                    response = await fetch(`${apiUrl}/v2/translate`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `DeepL-Auth-Key ${apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            text: pendingTexts,
                            target_lang: targetLang.toUpperCase()
                        })
                    });
                    data = await response.json().catch(() => ({}));
                    if (response.status !== 429 && response.status < 500) break;
                    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt));
                }
                if (!response.ok || !Array.isArray(data.translations)
                    || data.translations.length !== pendingTexts.length) {
                    const traceId = response.headers.get('x-trace-id');
                    if (traceId) console.error(`DeepL trace ID: ${traceId}`);
                    throw new Error(data.message || 'Translation provider returned an invalid response.');
                }

                data.translations.forEach((translation, index) => {
                    const translatedText = translation.text;
                    if (typeof translatedText !== 'string') {
                        throw new Error('Translation provider returned invalid text.');
                    }
                    const originalText = pendingTexts[index];
                    translations[pendingIndices[index]] = translatedText;
                    translationCache.set(`${targetLang}:${originalText}`, translatedText);
                });
            }

            return res.json({ translations });
        } catch (error) {
            console.error('Translation request failed:', error.message);
            return res.status(503).json({ error: 'Translation service unavailable.' });
        }
    });

    return router;
}

module.exports = { createTranslationRouter };
