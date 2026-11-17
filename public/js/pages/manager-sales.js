(() => {
    const revenue = document.getElementById('sales-revenue');
    const orders = document.getElementById('sales-orders');
    const average = document.getElementById('sales-average');
    const revenueNote = document.getElementById('sales-revenue-note');
    const ordersNote = document.getElementById('sales-orders-note');
    const status = document.getElementById('sales-status');
    const error = document.getElementById('sales-error');
    const refresh = document.getElementById('sales-refresh');
    const form = document.getElementById('sales-range-form');
    const startDate = document.getElementById('sales-start-date');
    const endDate = document.getElementById('sales-end-date');
    const apply = document.getElementById('sales-apply');
    const reportType = document.getElementById('sales-report-type');
    const preset = document.getElementById('sales-period-preset');
    const viewMode = document.getElementById('sales-view-mode');
    const visuals = document.getElementById('sales-visuals');
    const chart = document.getElementById('sales-chart');
    const tableBody = document.querySelector('#sales-table tbody');
    const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    const integer = new Intl.NumberFormat('en-US');
    let timer;
    let loading = false;
    let appliedRange = null;
    let appliedType = 'activity';
    let businessTimeZone = 'America/Chicago';

    const hourLabel = hour => `${hour % 12 || 12} ${hour % 24 < 12 ? 'AM' : 'PM'}`;
    const hourRange = hour => `${hourLabel(hour)} – ${hourLabel(hour + 1)}`;

    const dateLabel = date => new Intl.DateTimeFormat('en-US', {
        month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
    }).format(new Date(`${date}T12:00:00Z`));
    const periodLabel = report => report.startDate === report.endDate ? dateLabel(report.startDate)
        : `${dateLabel(report.startDate)} through ${dateLabel(report.endDate)} (inclusive)`;
    const groupingLabel = report => report.grouping === 'item' ? 'Sales by item' : report.grouping === 'hourly' ? 'Hourly' : 'Daily';
    const bucketLabel = (report, row) => report.grouping === 'item' ? row.name : report.grouping === 'hourly' ? hourRange(row.hour) : dateLabel(row.date);

    // Compare money in whole cents and check every bucket against the requested
    // period so a stale or partial response cannot disagree with the cards.
    function validate(report, range, type) {
        const money = value => Number.isFinite(value) && value >= 0;
        const count = value => Number.isSafeInteger(value) && value >= 0;
        if (!report || SalesRange.validate(report.startDate, report.endDate) || typeof report.timeZone !== 'string'
            || (range && (report.startDate !== range.startDate || report.endDate !== range.endDate))
            || !Array.isArray(report.buckets)
            || !report.totals || !money(report.totals.revenue) || !count(report.totals.orderCount)) {
            throw new Error('Invalid sales report');
        }
        if (type === 'items') {
            if (report.grouping !== 'item' || !count(report.totals.quantity)
                || !report.buckets.every(row => row && Number.isSafeInteger(row.menuItemId) && row.menuItemId > 0
                    && typeof row.name === 'string' && row.name.length > 0 && count(row.quantity) && row.quantity > 0
                    && count(row.orderCount) && row.orderCount > 0 && row.orderCount <= report.totals.orderCount)
                || new Set(report.buckets.map(row => row.menuItemId)).size !== report.buckets.length
                || report.buckets.reduce((sum, row) => sum + row.quantity, 0) !== report.totals.quantity) {
                throw new Error('Invalid item sales report');
            }
            return;
        }
        if (report.grouping !== (report.startDate === report.endDate ? 'hourly' : 'daily')
            || report.buckets.length !== (report.grouping === 'hourly' ? 24 : SalesRange.dayCount(report.startDate, report.endDate))
            || !report.buckets.every((row, index) => row && money(row.revenue) && count(row.orderCount)
                && (report.grouping === 'hourly' ? row.hour === index : row.date === SalesRange.dateAt(report.startDate, index)))
        ) {
            throw new Error('Invalid sales report');
        }
        const cents = report.buckets.reduce((sum, row) => sum + Math.round(row.revenue * 100), 0);
        const countTotal = report.buckets.reduce((sum, row) => sum + row.orderCount, 0);
        if (cents !== Math.round(report.totals.revenue * 100) || countTotal !== report.totals.orderCount) {
            throw new Error('Inconsistent sales report');
        }
    }

    function display(report, range, type) {
        validate(report, range, type);
        const period = periodLabel(report);
        const byItem = report.grouping === 'item';
        businessTimeZone = report.timeZone;
        const updatedAt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: report.timeZone }).format(new Date());
        ManagerSalesChart.render(chart, report, { period, hourLabel, bucketLabel });
        const body = document.createDocumentFragment();
        report.buckets.forEach(row => {
            const tr = document.createElement('tr');
            const hour = document.createElement('th');
            hour.scope = 'row';
            hour.textContent = bucketLabel(report, row);
            const amount = document.createElement('td');
            amount.textContent = byItem ? integer.format(row.quantity) : currency.format(row.revenue);
            const count = document.createElement('td');
            count.textContent = integer.format(row.orderCount);
            tr.append(hour, amount, count);
            body.append(tr);
        });
        tableBody.replaceChildren(body);
        document.getElementById('sales-table-caption').textContent = byItem
            ? `Sales by item for ${period} (${report.timeZone}). Recorded quantities from completed orders. An order containing several items is counted in each item row; the total counts unique orders. Revenue cards use recorded order totals.`
            : `${groupingLabel(report)} sales for ${period} (${report.timeZone}). Completed orders only; revenue in USD.`;
        document.getElementById('sales-table-summary').textContent = byItem ? 'View sales by item table' : `View ${report.grouping} sales table`;
        document.getElementById('sales-period-heading').textContent = byItem ? 'Menu item' : report.grouping === 'hourly' ? 'Hour' : 'Date';
        document.getElementById('sales-value-heading').textContent = byItem ? 'Units sold' : 'Revenue (USD)';
        document.getElementById('sales-count-heading').textContent = byItem ? 'Orders containing item' : 'Completed orders';
        document.getElementById('sales-result-title').textContent = byItem ? 'Sales by item' : `${groupingLabel(report)} sales activity`;
        document.getElementById('sales-chart-caption').textContent = byItem
            ? `Units sold by menu item for ${period} (${report.timeZone}). Items are ranked by quantity. Revenue cards show recorded order revenue for the period.`
            : `${groupingLabel(report)} revenue for ${period} (${report.timeZone}), in US dollars (USD). Each bar represents one business ${report.grouping === 'hourly' ? 'hour' : 'day'}. Exact values are in the table below.`;
        revenue.textContent = currency.format(report.totals.revenue);
        average.textContent = currency.format(report.totals.orderCount ? report.totals.revenue / report.totals.orderCount : 0);
        document.getElementById('sales-table-revenue').textContent = byItem ? integer.format(report.totals.quantity) : currency.format(report.totals.revenue);
        orders.textContent = document.getElementById('sales-table-orders').textContent = integer.format(report.totals.orderCount);
        if (byItem) document.getElementById('sales-table-orders').textContent += ' unique';
        revenueNote.textContent = `${period} · USD`;
        ordersNote.textContent = `Completed orders for ${period}`;
        status.textContent = `${report.totals.orderCount === 0 ? 'No completed sales' : byItem && !report.buckets.length ? 'No item sales recorded' : 'Completed sales'} for ${period} (${report.timeZone}), grouped ${byItem ? 'by menu item' : report.grouping}. Updated at ${updatedAt}.`;
        if (!appliedRange) {
            startDate.value = report.startDate;
            endDate.value = report.endDate;
            appliedRange = { startDate: report.startDate, endDate: report.endDate };
        }
        showDraftNote();
        updateView();
        visuals.hidden = false;
    }

    function updateView() {
        document.getElementById('sales-chart-panel').hidden = viewMode.value === 'table';
        const tablePanel = document.getElementById('sales-table-panel');
        tablePanel.hidden = viewMode.value === 'chart';
        if (!tablePanel.hidden) tablePanel.open = true;
    }

    function showDraftNote() {
        const note = document.getElementById('sales-draft-note');
        note.textContent = appliedRange && (startDate.value !== appliedRange.startDate || endDate.value !== appliedRange.endDate || reportType.value !== appliedType)
            ? 'Selection changed. Choose Apply dates to update the report.' : '';
    }

    async function loadReport(range = appliedRange, type = appliedType) {
        if (loading) return;
        loading = true;
        clearTimeout(timer);
        if (range) appliedRange = { ...range };
        appliedType = type;
        refresh.disabled = apply.disabled = startDate.disabled = endDate.disabled = reportType.disabled = preset.disabled = true;
        visuals.hidden = true;
        visuals.setAttribute('aria-busy', 'true');
        chart.replaceChildren();
        tableBody.replaceChildren();
        revenue.textContent = orders.textContent = average.textContent = 'Loading…';
        revenueNote.textContent = ordersNote.textContent = 'Loading selected period';
        status.textContent = 'Loading sales for the selected period…';
        error.hidden = true;
        error.textContent = '';
        try {
            const query = range ? `?${new URLSearchParams(range)}` : '';
            const response = await fetch(`/api/reports/sales${type === 'items' ? '/items' : ''}${query}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
            if (!response.ok) {
                const failure = new Error('Sales request failed');
                if (response.status === 400) {
                    const body = await response.json();
                    if (typeof body.error === 'string') failure.userMessage = body.error;
                }
                throw failure;
            }
            display(await response.json(), range, type);
        } catch (failure) {
            revenue.textContent = orders.textContent = average.textContent = 'Unavailable';
            revenueNote.textContent = ordersNote.textContent = 'Sales data unavailable';
            status.textContent = 'Sales report unavailable.';
            error.textContent = failure.userMessage || 'Unable to load sales. Check your connection and select Refresh sales to try again.';
            error.hidden = false;
        } finally {
            visuals.setAttribute('aria-busy', 'false');
            refresh.disabled = apply.disabled = startDate.disabled = endDate.disabled = reportType.disabled = preset.disabled = false;
            loading = false;
            timer = setTimeout(() => loadReport(), 60000);
        }
    }

    form.addEventListener('submit', event => {
        event.preventDefault();
        if (loading) return;
        const message = SalesRange.validate(startDate.value, endDate.value);
        for (const input of [startDate, endDate]) {
            if (message) input.setAttribute('aria-invalid', 'true');
            else input.removeAttribute('aria-invalid');
        }
        if (message) {
            error.textContent = message;
            error.hidden = false;
            error.focus();
            return;
        }
        loadReport({ startDate: startDate.value, endDate: endDate.value }, reportType.value || 'activity');
    });
    for (const input of [startDate, endDate]) input.addEventListener('input', () => {
        preset.value = 'custom';
        input.removeAttribute('aria-invalid');
        showDraftNote();
    });
    reportType.addEventListener('change', showDraftNote);
    preset.addEventListener('change', () => {
        if (preset.value === 'custom') return;
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: businessTimeZone, year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(new Date());
        const part = type => parts.find(value => value.type === type).value;
        const today = `${part('year')}-${part('month')}-${part('day')}`;
        endDate.value = preset.value === 'yesterday' ? SalesRange.dateAt(today, -1) : today;
        startDate.value = preset.value === 'last7' ? SalesRange.dateAt(today, -6)
            : preset.value === 'month' ? `${today.slice(0, 8)}01` : endDate.value;
        for (const input of [startDate, endDate]) input.removeAttribute('aria-invalid');
        error.hidden = true;
        showDraftNote();
    });
    viewMode.addEventListener('change', updateView);
    refresh.addEventListener('click', () => loadReport());
    loadReport();
})();
