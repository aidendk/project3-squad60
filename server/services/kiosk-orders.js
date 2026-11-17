const { deductRecipeInventory } = require('./menu');
const KIOSK_EMPLOYEE_ID = 1;
const KIOSK_PAYMENT_METHOD = 'Card';

async function insertKioskOrder(pool, { items, totalPrice, tax, customerId, pointsSpent = 0, pointsEarned = 0, rewardReason = '', promotionDiscount = 0, promotionDetails = [] }) {
    for (let attempt = 1; attempt <= 5; attempt++) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const orderResult = await client.query({
                text: `INSERT INTO orders (
                    order_id, employee_id, order_timestamp, total_price, tax, tip, payment_method,
                    promotion_discount, promotion_details
                )
                VALUES (
                    (SELECT COALESCE(MAX(order_id), 0) + 1 FROM orders),
                    $1, (NOW() AT TIME ZONE 'UTC'), $2, $3, 0, $4, $5, $6::jsonb
                )
                RETURNING order_id`,
                values: [KIOSK_EMPLOYEE_ID, totalPrice, tax, KIOSK_PAYMENT_METHOD, promotionDiscount, JSON.stringify(promotionDetails)],
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
            if (customerId) {
                const locked = await client.query({
                    text: `SELECT points_balance
                        FROM loyalty_customers
                        WHERE customer_id = $1
                        FOR UPDATE`,
                    values: [customerId],
                    query_timeout: 5000
                });
                if (locked.rowCount !== 1) {
                    const missing = new Error('That phone number was not found.');
                    missing.statusCode = 404;
                    throw missing;
                }
                const balance = Number(locked.rows[0].points_balance);
                if (balance < pointsSpent) {
                    const short = new Error('Not enough points for that reward');
                    short.statusCode = 409;
                    throw short;
                }
                pointsRemaining = balance - pointsSpent + pointsEarned;
                await client.query({
                    text: `UPDATE loyalty_customers
                        SET points_balance = $1
                        WHERE customer_id = $2`,
                    values: [pointsRemaining, customerId],
                    query_timeout: 5000
                });
                if (pointsSpent > 0) {
                    await client.query({
                        text: `INSERT INTO loyalty_transactions (customer_id, order_id, points_delta, reason)
                            VALUES ($1, $2, $3, $4)`,
                        values: [customerId, orderId, -pointsSpent, rewardReason],
                        query_timeout: 5000
                    });
                }
                if (pointsEarned > 0) {
                    await client.query({
                        text: `INSERT INTO loyalty_transactions (customer_id, order_id, points_delta, reason)
                            VALUES ($1, $2, $3, 'Order Earned')`,
                        values: [customerId, orderId, pointsEarned],
                        query_timeout: 5000
                    });
                }
            }
            await client.query('COMMIT');
            return { order_id: orderId, points_remaining: pointsRemaining, points_earned: customerId ? pointsEarned : 0 };
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
