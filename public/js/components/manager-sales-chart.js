(() => {
    const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    const integer = new Intl.NumberFormat('en-US');
    const shortDate = date => new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', timeZone: 'UTC'
    }).format(new Date(`${date}T12:00:00Z`));

    function svg(tag, attributes = {}, text) {
        const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
        Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function render(chart, report, { period, hourLabel, bucketLabel }) {
        const content = document.createDocumentFragment();
        const byItem = report.grouping === 'item';
        content.append(
            svg('title', { id: 'sales-chart-title' }, `${byItem ? 'Units sold by item' : report.grouping === 'hourly' ? 'Hourly sales revenue (USD)' : 'Daily sales revenue (USD)'} for ${period}`),
            svg('desc', { id: 'sales-chart-description' }, `Completed orders in ${report.timeZone}. Period revenue ${currency.format(report.totals.revenue)}. Exact ${byItem ? 'quantities' : 'revenue'} and order counts are in the table below.`)
        );
        if (byItem) {
            const height = Math.max(180, report.buckets.length * 44 + 56);
            chart.setAttribute('viewBox', `0 0 960 ${height}`);
            chart.setAttribute('style', 'min-width: 680px');
            content.append(svg('text', { x: 250, y: 20, class: 'sales-axis-title' }, 'Units sold'));
            const max = report.buckets.reduce((peak, row) => Math.max(peak, row.quantity), 1);
            report.buckets.forEach((row, index) => {
                const y = 38 + index * 44;
                const width = row.quantity / max * 620;
                const bar = svg('rect', { x: 250, y, width, height: 24, rx: 3, class: 'sales-bar' });
                bar.append(svg('title', {}, `${row.name}: ${integer.format(row.quantity)} units in ${integer.format(row.orderCount)} orders`));
                const label = svg('text', { x: 234, y: y + 17, 'text-anchor': 'end', class: 'sales-axis' }, row.name.length > 30 ? `${row.name.slice(0, 29)}…` : row.name);
                label.append(svg('title', {}, row.name));
                content.append(label, bar, svg('text', { x: 262 + width, y: y + 17, class: 'sales-axis' }, integer.format(row.quantity)));
            });
            if (!report.buckets.length) content.append(svg('text', { x: 250, y: 90, class: 'sales-axis' }, 'No items sold in this period.'));
        } else {
            const left = 88, top = 30, bottom = 270;
            const width = Math.max(864, report.buckets.length * (report.grouping === 'hourly' ? 44 : 68));
            const bucketWidth = width / report.buckets.length;
            chart.setAttribute('viewBox', `0 0 ${left + width + 8} 330`);
            chart.setAttribute('style', `min-width: ${left + width + 8}px`);
            const peak = report.buckets.reduce((max, row) => Math.max(max, row.revenue), 1);
            const roughStep = peak / 4;
            const magnitude = 10 ** Math.floor(Math.log10(roughStep));
            const step = [1, 2, 5, 10].find(value => value >= roughStep / magnitude) * magnitude;
            const ceiling = step * 4;
            content.append(svg('text', { x: left, y: 16, class: 'sales-axis-title' }, 'Revenue (USD)'));
            for (let tick = 0; tick <= 4; tick++) {
                const y = bottom - (bottom - top) * tick / 4;
                content.append(
                    svg('line', { x1: left, x2: left + width, y1: y, y2: y, class: 'sales-grid' }),
                    svg('text', { x: left - 10, y: y + 4, 'text-anchor': 'end', class: 'sales-axis' }, currency.format(step * tick))
                );
            }
            report.buckets.forEach((row, index) => {
                const height = row.revenue / ceiling * (bottom - top);
                const x = left + index * bucketWidth;
                const bar = svg('rect', { x: x + 6, y: bottom - height, width: bucketWidth - 12, height, rx: 3, class: 'sales-bar' });
                bar.append(svg('title', {}, `${bucketLabel(report, row)}: ${currency.format(row.revenue)}; ${integer.format(row.orderCount)} completed orders`));
                content.append(bar, svg('text', { x: x + bucketWidth / 2, y: bottom + 22, 'text-anchor': 'middle', class: 'sales-axis' }, report.grouping === 'hourly' ? hourLabel(row.hour) : shortDate(row.date)));
            });
            content.append(svg('text', { x: left + width / 2, y: 320, 'text-anchor': 'middle', class: 'sales-axis-title' }, `${report.grouping === 'hourly' ? 'Hour' : 'Date'} (${report.timeZone})`));
        }
        chart.replaceChildren(content);
    }

    window.ManagerSalesChart = { render };
})();
