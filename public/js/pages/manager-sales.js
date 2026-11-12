(() => {
    const revenue = document.getElementById('sales-revenue');
    const orders = document.getElementById('sales-orders');
    const revenueNote = document.getElementById('sales-revenue-note');
    const ordersNote = document.getElementById('sales-orders-note');
    const status = document.getElementById('sales-status');
    const error = document.getElementById('sales-error');
    const refresh = document.getElementById('sales-refresh');
    const visuals = document.getElementById('sales-visuals');
    const chart = document.getElementById('sales-chart');
    const tableBody = document.querySelector('#sales-table tbody');
    const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    const integer = new Intl.NumberFormat('en-US');
    let timer;
    let loading = false;

    const hourLabel = hour => `${hour % 12 || 12} ${hour % 24 < 12 ? 'AM' : 'PM'}`;
    const hourRange = hour => `${hourLabel(hour)} – ${hourLabel(hour + 1)}`;

    // Reject incomplete or inconsistent snapshots instead of displaying a chart
    // that disagrees with the daily cards. Compare money in whole cents.
    function validate(report) {
        const money = value => Number.isFinite(value) && value >= 0;
        const count = value => Number.isSafeInteger(value) && value >= 0;
        if (!report || !/^\d{4}-\d{2}-\d{2}$/.test(report.businessDate) || typeof report.timeZone !== 'string'
            || !Array.isArray(report.hourly) || report.hourly.length !== 24
            || !report.hourly.every((row, hour) => row && row.hour === hour && money(row.revenue) && count(row.orderCount))
            || !report.totals || !money(report.totals.revenue) || !count(report.totals.orderCount)) {
            throw new Error('Invalid sales report');
        }
        const cents = report.hourly.reduce((sum, row) => sum + Math.round(row.revenue * 100), 0);
        const countTotal = report.hourly.reduce((sum, row) => sum + row.orderCount, 0);
        if (cents !== Math.round(report.totals.revenue * 100) || countTotal !== report.totals.orderCount) {
            throw new Error('Inconsistent sales report');
        }
    }

    function svgElement(tag, attributes = {}, text) {
        const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
        Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function drawChart(report, dateLabel) {
        const content = document.createDocumentFragment();
        content.append(
            svgElement('title', { id: 'sales-chart-title' }, `Hourly sales revenue (USD) for ${dateLabel}`),
            svgElement('desc', { id: 'sales-chart-description' }, `Completed orders in ${report.timeZone}. Daily revenue ${currency.format(report.totals.revenue)}. Exact hourly revenue and order counts are in the table below.`)
        );
        const left = 88, top = 30, bottom = 270, width = 864;
        const peak = Math.max(1, ...report.hourly.map(row => row.revenue));
        const roughStep = peak / 4;
        const magnitude = 10 ** Math.floor(Math.log10(roughStep));
        const step = [1, 2, 5, 10].find(value => value >= roughStep / magnitude) * magnitude;
        const ceiling = step * 4;
        content.append(svgElement('text', { x: left, y: 16, class: 'sales-axis-title' }, 'Revenue (USD)'));
        for (let tick = 0; tick <= 4; tick++) {
            const y = bottom - (bottom - top) * tick / 4;
            content.append(
                svgElement('line', { x1: left, x2: left + width, y1: y, y2: y, class: 'sales-grid' }),
                svgElement('text', { x: left - 10, y: y + 4, 'text-anchor': 'end', class: 'sales-axis' }, currency.format(step * tick))
            );
        }
        report.hourly.forEach(row => {
            const height = row.revenue / ceiling * (bottom - top);
            const x = left + row.hour * width / 24;
            const bar = svgElement('rect', { x: x + 5, y: bottom - height, width: width / 24 - 10, height, rx: 2, class: 'sales-bar' });
            bar.append(svgElement('title', {}, `${hourRange(row.hour)}: ${currency.format(row.revenue)}; ${integer.format(row.orderCount)} completed orders`));
            content.append(bar, svgElement('text', { x: x + width / 48, y: bottom + 22, 'text-anchor': 'middle', class: 'sales-axis' }, hourLabel(row.hour)));
        });
        content.append(svgElement('text', { x: left + width / 2, y: 320, 'text-anchor': 'middle', class: 'sales-axis-title' }, `Hour (${report.timeZone})`));
        chart.replaceChildren(content);
    }

    function display(report) {
        validate(report);
        // Format the API's business date directly so the browser's timezone
        // cannot move it to a different calendar day.
        const dateLabel = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
            .format(new Date(`${report.businessDate}T12:00:00Z`));
        const updatedAt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: report.timeZone }).format(new Date());
        drawChart(report, dateLabel);
        const body = document.createDocumentFragment();
        report.hourly.forEach(row => {
            const tr = document.createElement('tr');
            const hour = document.createElement('th');
            hour.scope = 'row';
            hour.textContent = hourRange(row.hour);
            const amount = document.createElement('td');
            amount.textContent = currency.format(row.revenue);
            const count = document.createElement('td');
            count.textContent = integer.format(row.orderCount);
            tr.append(hour, amount, count);
            body.append(tr);
        });
        tableBody.replaceChildren(body);
        document.getElementById('sales-table-caption').textContent = `Hourly sales for ${dateLabel} (${report.timeZone}). Completed orders only; revenue in USD.`;
        revenue.textContent = document.getElementById('sales-table-revenue').textContent = currency.format(report.totals.revenue);
        orders.textContent = document.getElementById('sales-table-orders').textContent = integer.format(report.totals.orderCount);
        revenueNote.textContent = 'Completed orders · USD';
        ordersNote.textContent = 'Completed orders today';
        status.textContent = `${report.totals.orderCount === 0 ? 'No completed sales yet' : 'Completed sales'} for ${dateLabel} (${report.timeZone}). Updated at ${updatedAt}.`;
        visuals.hidden = false;
    }

    async function loadReport() {
        if (loading) return;
        loading = true;
        clearTimeout(timer);
        refresh.disabled = true;
        visuals.hidden = true;
        visuals.setAttribute('aria-busy', 'true');
        chart.replaceChildren();
        tableBody.replaceChildren();
        revenue.textContent = orders.textContent = 'Loading…';
        status.textContent = "Loading today's sales…";
        error.hidden = true;
        error.textContent = '';
        try {
            const response = await fetch('/api/reports/sales', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new Error('Sales request failed');
            display(await response.json());
        } catch {
            revenue.textContent = orders.textContent = 'Unavailable';
            revenueNote.textContent = ordersNote.textContent = 'Sales data unavailable';
            status.textContent = 'Sales report unavailable.';
            error.textContent = 'Unable to load sales. Check your connection and select Refresh sales to try again.';
            error.hidden = false;
        } finally {
            visuals.setAttribute('aria-busy', 'false');
            refresh.disabled = false;
            loading = false;
            timer = setTimeout(loadReport, 60000);
        }
    }

    refresh.addEventListener('click', loadReport);
    loadReport();
})();
