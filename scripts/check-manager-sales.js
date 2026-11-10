async (page) => {
    // Run with the Playwright browser tool against the local app on port 3100.
    // Sales responses are intercepted; fixtures do not change database records.
    page.setDefaultTimeout(5000);
    await page.clock.install();
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const fixture = () => ({
        businessDate: '2026-11-10', timeZone: 'America/Chicago',
        hourly: Array.from({ length: 24 }, (_, hour) => ({
            hour, revenue: ({ 0: 0.1, 11: 0.2, 12: 123.45, 23: 7.25 })[hour] || 0,
            orderCount: ({ 0: 1, 11: 1, 12: 3, 23: 2 })[hour] || 0
        })),
        totals: { revenue: 131, orderCount: 7 }
    });
    let mode = 'hold';
    let release;
    const initialResponse = new Promise(resolve => { release = resolve; });
    let requests = 0;
    await page.route('**/api/reports/sales', async route => {
        requests++;
        if (mode === 'hold') await initialResponse;
        if (mode === 'error') return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
        if (mode === 'network-error') return route.abort('failed');
        const data = fixture();
        if (mode === 'empty' || mode === 'free') {
            data.hourly.forEach(row => { row.revenue = row.orderCount = 0; });
            data.totals = { revenue: 0, orderCount: 0 };
            if (mode === 'free') data.hourly[12].orderCount = data.totals.orderCount = 1;
        }
        if (mode === 'mismatch') data.totals.revenue = 999;
        return route.fulfill({ json: data });
    });
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto('http://127.0.0.1:3100/manager', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#sales-status')?.textContent.includes('Loading'));
    assert(await page.locator('#sales-revenue').textContent() === 'Loading…', 'Revenue must show loading');
    assert(await page.locator('#sales-orders').textContent() === 'Loading…', 'Orders must show loading');
    assert(await page.locator('#sales-refresh').isDisabled(), 'Loading must prevent duplicate refresh requests');
    assert(!await page.locator('#sales-visuals').isVisible(), 'Chart and table must wait for sales data');
    await page.waitForFunction(() => document.querySelector('#sales-refresh').disabled);
    mode = 'sales';
    release();

    async function loaded() {
        await page.locator('#sales-visuals').waitFor({ state: 'visible' });
        assert(!await page.locator('#sales-refresh').isDisabled(), 'Refresh must be available after a response');
    }
    async function refresh(nextMode) {
        mode = nextMode;
        await page.locator('#sales-refresh').click();
        if (['error', 'network-error', 'mismatch'].includes(nextMode)) {
            await page.locator('#sales-error').waitFor({ state: 'visible' });
        } else await loaded();
    }
    await loaded();
    assert(await page.locator('#sales-revenue').textContent() === '$131.00', 'Revenue KPI must use the endpoint daily total');
    assert(await page.locator('#sales-orders').textContent() === '7', 'Order KPI must use the endpoint daily count');
    assert((await page.locator('#sales-status').textContent()).includes('America/Chicago'), 'Show the business timezone');
    assert((await page.locator('#sales-status').textContent()).includes('November 10, 2026'), 'Show the endpoint business date');
    await page.getByText('View hourly sales table', { exact: true }).click();
    const rows = await page.locator('#sales-table tbody tr').allTextContents();
    assert(rows.length === 24, 'The accessible table must contain all 24 hours');
    assert((await page.locator('#sales-table thead').textContent()).includes('Revenue (USD)'), 'Table currency units must be explicit');
    const rects = page.locator('#sales-chart rect');
    assert(await rects.count() === 24, 'The chart must contain all 24 hourly bars');
    const data = fixture();
    for (const row of data.hourly) {
        const cells = await page.locator('#sales-table tbody tr').nth(row.hour).locator('th, td').allTextContents();
        const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(row.revenue);
        assert(cells[1] === money && cells[2] === String(row.orderCount), `Table values must match hour ${row.hour}`);
        const title = await rects.nth(row.hour).locator('title').textContent();
        assert(title.includes(cells[0]) && title.includes(money), `Chart values must match the table for hour ${row.hour}`);
        assert(Number(await rects.nth(row.hour).getAttribute('height')) >= 0, 'Bar height must be valid');
    }
    assert((await page.locator('#sales-table tfoot').textContent()).includes('$131.00'), 'Table totals must match KPI totals');
    assert(Number(await rects.nth(12).getAttribute('height')) > Number(await rects.nth(23).getAttribute('height')), 'Bar heights must represent revenue');

    for (const errorMode of ['error', 'network-error', 'mismatch']) {
        await refresh(errorMode);
        assert(await page.locator('#sales-revenue').textContent() === 'Unavailable', 'Failed refresh must clear the old revenue');
        assert(await page.locator('#sales-orders').textContent() === 'Unavailable', 'Failed refresh must clear the old order count');
        assert(!await page.locator('#sales-visuals').isVisible(), 'Failed refresh must hide old chart/table values');
        await refresh('sales');
        assert(await page.locator('#sales-revenue').textContent() === '$131.00', 'Refresh must recover from errors');
    }
    await refresh('empty');
    assert(await page.locator('#sales-revenue').textContent() === '$0.00', 'Empty day revenue must be zero');
    assert(await page.locator('#sales-orders').textContent() === '0', 'Empty day order count must be zero');
    assert((await page.locator('#sales-status').textContent()).includes('No completed sales yet'), 'Empty day needs a distinct message');
    assert((await rects.evaluateAll(nodes => nodes.every(node => Number(node.getAttribute('height')) === 0))), 'Empty day must not show phantom bars');
    await refresh('free');
    assert(await page.locator('#sales-orders').textContent() === '1', 'Zero-revenue completed orders must still be counted');
    assert(!(await page.locator('#sales-status').textContent()).includes('No completed sales yet'), 'Free orders must not be described as no sales');

    const before = requests;
    mode = 'sales';
    await page.clock.fastForward(60000);
    await loaded();
    await page.waitForFunction(() => document.querySelector('#sales-revenue').textContent === '$131.00');
    assert(requests === before + 1, 'Live data must refresh once per minute');
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile page must not overflow horizontally');
    assert(await page.locator('#sales-chart-scroll').evaluate(node => node.scrollWidth > node.clientWidth), 'Mobile chart must scroll without clipping hour labels');
    return { passed: ['loading', 'chart/table/KPI agreement', 'currency and hours', 'business date/timezone', 'request and network errors', 'inconsistent response', 'retry', 'no sales', 'free orders', 'automatic refresh', 'mobile layout'], requests };
}
