const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { createWeatherRouter } = require('../server/routes/weather');

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

const sample = {
    current: {
        temp_f: 78.4,
        condition: {
            text: 'Partly cloudy',
            icon: '//cdn.weatherapi.com/weather/64x64/day/116.png'
        }
    }
};

describe('kiosk weather', () => {
    it('returns current conditions without the API key and reuses the cache', async () => {
        let calls = 0;
        const app = express();
        app.use(createWeatherRouter({
            apiKey: 'secret-key',
            fetchImpl: async () => {
                calls += 1;
                return { ok: true, json: async () => sample };
            }
        }));
        const server = await listen(app);
        try {
            const first = await getJson(server);
            const second = await getJson(server);
            assert.equal(first.status, 200);
            assert.deepEqual(first.body, {
                location: 'College Station',
                tempF: 78,
                condition: 'Partly cloudy',
                icon: 'https://cdn.weatherapi.com/weather/64x64/day/116.png'
            });
            assert.deepEqual(second.body, first.body);
            assert.equal(calls, 1);
            assert.equal(JSON.stringify(first.body).includes('secret-key'), false);
        } finally {
            server.close();
        }
    });

    it('reports when weather is not configured', async () => {
        const app = express();
        app.use(createWeatherRouter({ apiKey: '' }));
        const server = await listen(app);
        try {
            const result = await getJson(server);
            assert.equal(result.status, 503);
        } finally {
            server.close();
        }
    });
});
