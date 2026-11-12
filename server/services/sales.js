const BUSINESS_TIME_ZONE = 'America/Chicago';

// Existing writers use UTC for order_timestamp (timestamp without time zone).
// Convert local midnight boundaries back to UTC before comparing the bare column,
// so the status/timestamp index can be used. Never join items into order totals.
const salesQuery = `
    WITH business_day AS (
        SELECT ($1::timestamptz AT TIME ZONE $2::text)::date AS date
    ), hourly AS (
        SELECT EXTRACT(HOUR FROM order_timestamp AT TIME ZONE 'UTC' AT TIME ZONE $2::text)::integer AS hour,
               SUM(total_price) AS revenue, COUNT(*) AS order_count
        FROM orders CROSS JOIN business_day
        WHERE status = 'completed'
          AND order_timestamp >= (business_day.date::timestamp AT TIME ZONE $2::text AT TIME ZONE 'UTC')
          AND order_timestamp < ((business_day.date + 1)::timestamp AT TIME ZONE $2::text AT TIME ZONE 'UTC')
        GROUP BY 1
    ), buckets AS (
        SELECT business_day.date::text AS business_date, hour,
               COALESCE(hourly.revenue, 0) AS revenue,
               COALESCE(hourly.order_count, 0) AS order_count
        FROM business_day CROSS JOIN generate_series(0, 23) AS hours(hour)
        LEFT JOIN hourly USING (hour)
    )
    SELECT *, SUM(revenue) OVER () AS daily_revenue,
           SUM(order_count) OVER () AS daily_order_count
    FROM buckets ORDER BY hour
`;

async function getSalesReport(pool) {
    const { rows } = await pool.query({
        text: salesQuery,
        values: [new Date().toISOString(), BUSINESS_TIME_ZONE],
        query_timeout: 5000
    });

    return {
        businessDate: rows[0].business_date,
        timeZone: BUSINESS_TIME_ZONE,
        hourly: rows.map(row => ({
            hour: row.hour,
            revenue: Number(row.revenue),
            orderCount: Number(row.order_count)
        })),
        totals: {
            revenue: Number(rows[0].daily_revenue),
            orderCount: Number(rows[0].daily_order_count)
        }
    };
}

module.exports = { BUSINESS_TIME_ZONE, salesQuery, getSalesReport };
