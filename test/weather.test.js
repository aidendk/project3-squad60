const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { createWeatherRouter, recommendWeather, FALLBACK_WEATHER } = require('../server/routes/weather');

function listen(app) {
    return new Promise((resolve) => {
        const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
}

function getJson(server) {
    const { port } = server.address();
    return new Promise((resolve, reject) => {
        http.get({ hostname: '127.0.0.1', port, path: '/api/weather' }, (res) => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
        }).on('error', reject);
    });
}

function sample(tempF, text) {
    return {
        current: {
            temp_f: tempF,
            condition: {
                text,
                icon: '//cdn.weatherapi.com/weather/64x64/day/116.png'
            }
        }
    };
}

describe('kiosk weather', () => {
    it('recommends a drink for heat, mild weather, cold, and rain', () => {
        const hot = recommendWeather(88, 'Sunny');
        assert.equal(hot.recommendationCategory, 'Fruit Tea');
        assert.equal(hot.badge, 'Ice Cold Favorite');
        assert.equal(hot.highlightNames, null);

        const mild = recommendWeather(74, 'Partly cloudy');
        assert.equal(mild.badge, 'Boba Favorite');
        assert.deepEqual(mild.highlightNames, ['brown sugar milk tea', 'classic milk tea']);

        const chilly = recommendWeather(52, 'Clear');
        assert.equal(chilly.badge, 'Warm Cup');
        assert.match(chilly.bannerText, /52°F/);
        assert.deepEqual(chilly.highlightNames, ['taro milk tea', 'oolong milk tea']);

        const rain = recommendWeather(90, 'Moderate rain');
        assert.match(rain.bannerText, /Rainy Afternoon/);
        assert.equal(rain.badge, 'Cozy Pick');
        assert.equal(rain.recommendationCategory, 'Milk Tea');
    });

    it('returns current conditions without the API key and reuses the cache', async () => {
        let calls = 0;
        const app = express();
        app.use(createWeatherRouter({
            apiKey: 'secret-key',
            fetchImpl: async () => {
                calls += 1;
                return { ok: true, json: async () => sample(78.4, 'Partly cloudy') };
            }
        }));
        const server = await listen(app);
        try {
            const first = await getJson(server);
            const second = await getJson(server);
            assert.equal(first.status, 200);
            assert.equal(first.body.tempF, 78);
            assert.equal(first.body.condition, 'Partly cloudy');
            assert.equal(first.body.icon, 'https://cdn.weatherapi.com/weather/64x64/day/116.png');
            assert.equal(first.body.recommendationText, recommendWeather(78, 'Partly cloudy').recommendationText);
            assert.deepEqual(second.body, first.body);
            assert.equal(calls, 1);
            assert.equal(JSON.stringify(first.body).includes('secret-key'), false);
        } finally {
            server.close();
        }
    });

    it('serves a boba recommendation when weather is unavailable', async () => {
        let calls = 0;
        const app = express();
        app.use(createWeatherRouter({
            apiKey: 'secret-key',
            fetchImpl: async () => {
                calls += 1;
                throw new Error('offline');
            }
        }));
        const server = await listen(app);
        try {
            const first = await getJson(server);
            const second = await getJson(server);
            assert.equal(first.status, 200);
            assert.deepEqual(first.body, FALLBACK_WEATHER);
            assert.deepEqual(second.body, FALLBACK_WEATHER);
            assert.equal(calls, 2);
        } finally {
            server.close();
        }
    });
});
