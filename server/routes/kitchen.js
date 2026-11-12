const express = require('express');
const { parseItemId } = require('../../public/js/shared/price-validation');
const { databaseQueryTimeout } = require('../config');

function createKitchenRouter({ pool, orderSchemaReady }) {
    const router = express.Router();
    router.get('/api/kitchen/orders', async (req, res) => {
        try {
            await orderSchemaReady;
            const result = await pool.query({
                text: `
                    SELECT
                        o.order_id,
                        o.source,
                        o.order_timestamp AS timestamp,
                        o.status,
                        COALESCE(
                            json_agg(
                                json_build_object(
                                    'name', m.name,
                                    'quantity', oi.quantity
                                ) ORDER BY oi.order_item_id
                            ) FILTER (WHERE oi.order_item_id IS NOT NULL),
                            '[]'::json
                        ) AS items
                    FROM orders o
                    LEFT JOIN order_item oi ON oi.order_id = o.order_id
                    LEFT JOIN menu_item m ON m.menu_item_id = oi.menu_item_id
                    WHERE o.status = $1
                    GROUP BY o.order_id, o.source, o.order_timestamp, o.status
                    ORDER BY o.order_timestamp ASC
                `,
                values: ['pending'],
                query_timeout: databaseQueryTimeout
            });
            res.json(result.rows);
        } catch (err) {
            console.error('Error loading pending kitchen orders', err);
            res.status(503).json({ error: 'Unable to load pending orders. Please try again.' });
        }
    });

    router.patch('/api/kitchen/orders/:id', async (req, res) => {
        const id = parseItemId(req.params.id);
        if (id === null) return res.status(400).json({ error: 'Order ID must be a positive PostgreSQL integer.' });

        try {
            await orderSchemaReady;
            const result = await pool.query({
                text: "UPDATE orders SET status = 'completed' WHERE order_id = $1 AND status = 'pending' RETURNING order_id, status",
                values: [id],
                query_timeout: 5000
            });
            if (result.rowCount === 0) return res.status(404).json({ error: 'Order not found.' });
            res.json(result.rows[0]);
        } catch (err) {
            console.error('Error completing kitchen order', err);
            res.status(503).json({ error: 'Unable to complete the order. Please try again.' });
        }
    });
    return router;
}

module.exports = { createKitchenRouter };
