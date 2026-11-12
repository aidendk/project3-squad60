const { deductRecipeInventory } = require('./menu');
const KIOSK_EMPLOYEE_ID = 1;
const KIOSK_PAYMENT_METHOD = 'Card';

async function insertKioskOrder(pool, { items, totalPrice, tax, customerId, pointsSpent }) {
    for (let attempt = 1; attempt <= 5; attempt++) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const orderResult = await client.query({
                text: `INSERT INTO orders (
                    order_id, employee_id, order_timestamp, total_price, tax, tip, payment_method
                )
                VALUES (
                    (SELECT COALESCE(MAX(order_id), 0) + 1 FROM orders),
                    $1, (NOW() AT TIME ZONE 'UTC'), $2, $3, 0, $4
                )
                RETURNING order_id`,
                values: [KIOSK_EMPLOYEE_ID, totalPrice, tax, KIOSK_PAYMENT_METHOD],
                query_timeout: 5000
            });
            const orderId = orderResult.rows[0].order_id;

            for (const item of items) {
                await client.query({
                    text: `INSERT INTO order_item (order_item_id, order_id, menu_item_id, quantity)
                        VALUES (
                            (SELECT COALESCE(MAX(order_item_id), 0) + 1 FROM order_item),
                            $1, $2, $3
                        )`,
                    values: [orderId, item.menu_item_id, item.quantity],
                    query_timeout: 5000
                });
            }

            await deductRecipeInventory(client, items);
            let pointsRemaining = null;
            if (pointsSpent > 0) {
                const pointsResult = await client.query({
                    text: `UPDATE "CustomerPoints"
                        SET points = points - $1
                        WHERE "customerId" = $2 AND points >= $1
                        RETURNING points`,
                    values: [pointsSpent, customerId],
                    query_timeout: 5000
                });
                if (pointsResult.rowCount !== 1) {
                    const pointsErr = new Error('Not enough points for that reward');
                    pointsErr.statusCode = 409;
                    throw pointsErr;
                }
                pointsRemaining = Number(pointsResult.rows[0].points);
            }
            await client.query('COMMIT');
            return { order_id: orderId, points_remaining: pointsRemaining };
        } catch (err) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackErr) {
                console.error('Error rolling back kiosk order', rollbackErr);
            }
            if (err.code === '23505' && attempt < 5) {
                continue;
            }
            throw err;
        } finally {
            client.release();
        }
    }

    throw new Error('Unable to allocate an order id');
}

module.exports = { insertKioskOrder };
