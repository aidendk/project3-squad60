const express = require('express');

const LOCATION = 'College Station';
const CACHE_MS = 15 * 60 * 1000;

const FALLBACK_WEATHER = {
    location: LOCATION,
    city: 'College Station, TX',
    tempF: 75,
    condition: 'Sunny',
    icon: '',
    emoji: '🧋',
    bannerText: 'Great day for freshly brewed boba!',
    recommendationText: 'Classic Milk Tea',
    recommendationCategory: 'Milk Tea',
    badge: 'Boba Favorite',
    highlightNames: ['classic milk tea']
};

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

function recommendWeather(tempF, conditionText) {
    const rainy = /rain|drizzle/i.test(conditionText || '');
    if (rainy) {
        return {
            emoji: '🌧️',
            bannerText: 'Rainy Afternoon — Cozy Up at Quality Boba!',
            recommendationText: 'Hot Brown Sugar Ginger Tea or Warm Thai Milk Tea',
            recommendationCategory: 'Milk Tea',
            badge: 'Cozy Pick',
            highlightNames: ['thai milk tea', 'brown sugar milk tea']
        };
    }
    if (tempF < 65) {
        return {
            emoji: '❄️',
            bannerText: `Chilly Day (${tempF}°F) — Warm Up with Fresh Hot Boba!`,
            recommendationText: 'Steaming Hot Taro Milk Tea & Roasted Oolong with Herbal Jelly',
            recommendationCategory: 'Milk Tea',
            badge: 'Warm Cup',
            highlightNames: ['taro milk tea', 'oolong milk tea']
        };
    }
    if (tempF >= 82) {
        return {
            emoji: '☀️',
            bannerText: `High Temp Alert (${tempF}°F in College Station) — Beat the Heat!`,
            recommendationText: 'Refreshing Iced Mango Passionfruit Green Tea & Fruit Slushes',
            recommendationCategory: 'Fruit Tea',
            badge: 'Ice Cold Favorite',
            highlightNames: null
        };
    }
    return {
        emoji: '⛅',
        bannerText: `Beautiful Weather in Aggieland (${tempF}°F) — Perfect for Boba!`,
        recommendationText: 'Signature Brown Sugar Boba Milk Tea with Chewy Tapioca',
        recommendationCategory: 'Milk Tea',
        badge: 'Boba Favorite',
        highlightNames: ['brown sugar milk tea', 'classic milk tea']
    };
}

function toWeather(body) {
    const temp = body?.current?.temp_f;
    const condition = body?.current?.condition?.text;
    if (typeof temp !== 'number' || !Number.isFinite(temp) || typeof condition !== 'string' || !condition.trim()) {
        return null;
    }
    const tempF = Math.round(temp);
    return {
        location: LOCATION,
        city: 'College Station, TX',
        tempF,
        condition: condition.trim(),
        icon: iconUrl(body.current.condition.icon),
        ...recommendWeather(tempF, condition)
    };
}

function createWeatherRouter({ apiKey = process.env.WEATHER_API_KEY, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
    const router = express.Router();
    let cached = null;

    router.get('/api/weather', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (cached && now() - cached.at < CACHE_MS) {
            return res.json(cached.body);
        }
        if (!apiKey) {
            return res.json(FALLBACK_WEATHER);
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
            return res.json(FALLBACK_WEATHER);
        }
    });

    return router;
}

module.exports = { createWeatherRouter, recommendWeather, FALLBACK_WEATHER };
