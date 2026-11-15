const express = require('express');

const LOCATION = 'College Station';
const CACHE_MS = 10 * 60 * 1000;

function iconUrl(icon) {
    if (typeof icon !== 'string') {
        return '';
    }
    const absolute = icon.startsWith('//') ? `https:${icon}` : icon;
    try {
        const url = new URL(absolute);
        if (url.protocol === 'https:' && url.hostname === 'cdn.weatherapi.com') {
            return url.href;
        }
    } catch {
        return '';
    }
    return '';
}

function toWeather(body) {
    const temp = body?.current?.temp_f;
    const condition = body?.current?.condition?.text;
    if (typeof temp !== 'number' || !Number.isFinite(temp) || typeof condition !== 'string' || !condition.trim()) {
        return null;
    }
    return {
        location: LOCATION,
        tempF: Math.round(temp),
        condition: condition.trim(),
        icon: iconUrl(body.current.condition.icon)
    };
}

function createWeatherRouter({ apiKey = process.env.WEATHER_API_KEY, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
    const router = express.Router();
    let cached = null;

    router.get('/api/weather', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!apiKey) {
            return res.status(503).json({ error: 'Weather is not configured' });
        }
        if (cached && now() - cached.at < CACHE_MS) {
            return res.json(cached.body);
        }

        const url = new URL('https://api.weatherapi.com/v1/current.json');
        url.searchParams.set('key', apiKey);
        url.searchParams.set('q', LOCATION);

        try {
            const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
            if (!response.ok) {
                throw new Error(`WeatherAPI responded ${response.status}`);
            }
            const view = toWeather(await response.json());
            if (!view) {
                throw new Error('WeatherAPI response was missing current conditions');
            }
            cached = { at: now(), body: view };
            return res.json(view);
        } catch (err) {
            console.error('Weather lookup failed:', String(err.message).replaceAll(apiKey, '[key]'));
            if (cached) {
                return res.json(cached.body);
            }
            return res.status(502).json({ error: 'Weather is unavailable' });
        }
    });

    return router;
}

module.exports = { createWeatherRouter, toWeather };
