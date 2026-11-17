const SalesRange = require('../../public/js/shared/sales-range');
const BUSINESS_TIME_ZONE = 'America/Chicago';

class SalesRangeError extends Error {}

function resolveSalesRange(query = {}, now = new Date()) {
    if (query.startDate === undefined && query.endDate === undefined) {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(now);
        const part = type => parts.find(value => value.type === type).value;
        const today = `${part('year')}-${part('month')}-${part('day')}`;
        return { startDate: today, endDate: today };
    }
    const error = SalesRange.validate(query.startDate, query.endDate);
    if (error) throw new SalesRangeError(error);
    return { startDate: query.startDate, endDate: query.endDate };
}

// Existing writers use UTC for order_timestamp (timestamp without time zone).
// Convert each local midnight independently so DST days get correct boundaries.
// Compare the bare indexed column; never join items into order totals.
const salesQuery = `
    WITH sales AS (
        SELECT CASE WHEN $4::text = 'hourly'
                   THEN EXTRACT(HOUR FROM order_timestamp AT TIME ZONE 'UTC' AT TIME ZONE $3::text)::integer
                   ELSE (order_timestamp AT TIME ZONE 'UTC' AT TIME ZONE $3::text)::date - $1::date
               END AS bucket_index,
               SUM(total_price) AS revenue, COUNT(*) AS order_count
        FROM orders
        WHERE status = 'completed'
          AND order_timestamp >= ($1::date::timestamp AT TIME ZONE $3::text AT TIME ZONE 'UTC')
          AND order_timestamp < (($2::date + 1)::timestamp AT TIME ZONE $3::text AT TIME ZONE 'UTC')
        GROUP BY 1
    ), buckets AS (
        SELECT bucket_index, COALESCE(sales.revenue, 0) AS revenue,
               COALESCE(sales.order_count, 0) AS order_count
        FROM generate_series(0, CASE WHEN $4::text = 'hourly' THEN 23 ELSE $2::date - $1::date END) AS periods(bucket_index)
        LEFT JOIN sales USING (bucket_index)
    )
    SELECT *, SUM(revenue) OVER () AS total_revenue,
           SUM(order_count) OVER () AS total_order_count
    FROM buckets ORDER BY bucket_index
`;

async function getSalesReport(pool, options = {}) {
    const { startDate, endDate } = resolveSalesRange(options);
    const grouping = startDate === endDate ? 'hourly' : 'daily';
    const { rows } = await pool.query({
        text: salesQuery,
        values: [startDate, endDate, BUSINESS_TIME_ZONE, grouping],
        query_timeout: 5000
    });

    return {
        startDate, endDate, grouping,
        timeZone: BUSINESS_TIME_ZONE,
        buckets: rows.map(row => ({
            ...(grouping === 'hourly' ? { hour: row.bucket_index } : { date: SalesRange.dateAt(startDate, row.bucket_index) }),
            revenue: Number(row.revenue),
            orderCount: Number(row.order_count)
        })),
        totals: {
            revenue: Number(rows[0].total_revenue),
            orderCount: Number(rows[0].total_order_count)
        }
    };
}

// Count quantities from the original line items. Revenue is aggregated from
// orders separately so multi-item orders cannot multiply the recorded total.
// Current menu prices cannot reconstruct historical line-item revenue.
const itemSalesQuery = `
    WITH selected_orders AS (
        SELECT order_id, total_price FROM orders
        WHERE status = 'completed'
          AND order_timestamp >= ($1::date::timestamp AT TIME ZONE $3::text AT TIME ZONE 'UTC')
          AND order_timestamp < (($2::date + 1)::timestamp AT TIME ZONE $3::text AT TIME ZONE 'UTC')
    ), items AS (
        SELECT oi.menu_item_id,
               COALESCE(m.name, 'Unavailable menu item #' || oi.menu_item_id::text) AS name,
               SUM(oi.quantity) AS quantity, COUNT(DISTINCT o.order_id) AS order_count
        FROM selected_orders o
        JOIN order_item oi ON oi.order_id = o.order_id
        LEFT JOIN menu_item m ON m.menu_item_id = oi.menu_item_id
        GROUP BY oi.menu_item_id, m.name
    ), totals AS (
        SELECT COALESCE(SUM(total_price), 0) AS total_revenue, COUNT(*) AS total_order_count,
               (SELECT COALESCE(SUM(quantity), 0) FROM items) AS total_quantity
        FROM selected_orders
    )
    SELECT items.*, totals.* FROM totals LEFT JOIN items ON TRUE
    ORDER BY quantity DESC, name, menu_item_id
`;

async function getItemSalesReport(pool, options = {}) {
    const { startDate, endDate } = resolveSalesRange(options);
    const { rows } = await pool.query({
        text: itemSalesQuery, values: [startDate, endDate, BUSINESS_TIME_ZONE], query_timeout: 5000
    });
    return {
        startDate, endDate, timeZone: BUSINESS_TIME_ZONE, grouping: 'item',
        buckets: rows.filter(row => row.menu_item_id !== null).map(row => ({
            menuItemId: row.menu_item_id, name: row.name,
            quantity: Number(row.quantity), orderCount: Number(row.order_count)
        })),
        totals: {
            revenue: Number(rows[0].total_revenue), orderCount: Number(rows[0].total_order_count),
            quantity: Number(rows[0].total_quantity)
        }
    };
}

module.exports = { BUSINESS_TIME_ZONE, SalesRangeError, resolveSalesRange, salesQuery, getSalesReport, getItemSalesReport };
