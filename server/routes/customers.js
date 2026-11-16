const express = require('express');
const { availableRewards, normalizePhone } = require('../../public/js/shared/rewards');

function presentCustomer(row) {
    const balance = Number(row.points_balance);
    return {
        customer_id: row.customer_id,
        phone_number: row.phone_number,
        full_name: row.full_name,
        points_balance: balance,
        available_rewards: availableRewards(balance).map((reward) => ({
            reward_id: reward.id,
            cost: reward.points,
            discount: reward.discount,
            label: reward.label
        }))
    };
}

function createCustomersRouter({ pool }) {
    const router = express.Router();

    router.post('/api/loyalty/lookup', async (req, res) => {
        const phone = normalizePhone(req.body?.phone);
        const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        if (!phone) {
            return res.status(400).json({ error: 'Enter a 10-digit phone number.' });
        }
        if (name.length > 100) {
            return res.status(400).json({ error: 'Name must be 100 characters or less.' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const existing = await client.query({
                text: `SELECT customer_id, phone_number, full_name, points_balance
                    FROM loyalty_customers
                    WHERE phone_number = $1`,
                values: [phone],
                query_timeout: 5000
            });
            if (existing.rowCount === 1) {
                await client.query('COMMIT');
                return res.json(presentCustomer(existing.rows[0]));
            }
            if (!name) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Enter your name to join.', needsName: true });
            }

            const created = await client.query({
                text: `INSERT INTO loyalty_customers (phone_number, full_name, points_balance)
                    VALUES ($1, $2, 50)
                    RETURNING customer_id, phone_number, full_name, points_balance`,
                values: [phone, name],
                query_timeout: 5000
            });
            await client.query({
                text: `INSERT INTO loyalty_transactions (customer_id, points_delta, reason)
                    VALUES ($1, 50, 'Welcome bonus')`,
                values: [created.rows[0].customer_id],
                query_timeout: 5000
            });
            await client.query('COMMIT');
            return res.status(201).json(presentCustomer(created.rows[0]));
        } catch (err) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackErr) {
                console.error('Error rolling back loyalty signup', rollbackErr);
            }
            if (err.code === '23505') {
                const again = await pool.query({
                    text: `SELECT customer_id, phone_number, full_name, points_balance
                        FROM loyalty_customers
                        WHERE phone_number = $1`,
                    values: [phone],
                    query_timeout: 5000
                });
                if (again.rowCount === 1) {
                    return res.json(presentCustomer(again.rows[0]));
                }
            }
            console.error('Error looking up loyalty customer', err);
            return res.status(500).json({ error: 'Unable to look up rewards' });
        } finally {
            client.release();
        }
    });

    return router;
}

module.exports = { createCustomersRouter };
