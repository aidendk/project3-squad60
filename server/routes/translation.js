const express = require('express');

const PLACEHOLDER_API_KEY = 'YOUR_GOOGLE_TRANSLATE_API_KEY';
const MAX_TEXTS = 100;
const MAX_TEXT_LENGTH = 1000;

function createTranslationRouter({ apiKey = process.env.GOOGLE_TRANSLATE_API_KEY || PLACEHOLDER_API_KEY } = {}) {
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
        if (!apiKey || apiKey === PLACEHOLDER_API_KEY) {
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
                const response = await fetch(
                    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ q: pendingTexts, target: targetLang, format: 'text' })
                    }
                );
                const data = await response.json();
                if (!response.ok || !Array.isArray(data.data?.translations)
                    || data.data.translations.length !== pendingTexts.length) {
                    throw new Error(data.error?.message || 'Translation provider returned an invalid response.');
                }

                data.data.translations.forEach((translation, index) => {
                    const translatedText = translation.translatedText;
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
