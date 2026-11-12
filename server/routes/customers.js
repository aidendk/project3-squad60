const express = require('express');
const { isCustomerCode, rewardList } = require('../../public/js/shared/rewards');

function createCustomersRouter({ pool }) {
    const router = express.Router();
    router.post('/api/check-in', async (req, res) => {
        const customerId = typeof req.body?.customerId === 'string' ? req.body.customerId.trim() : '';
        if (!isCustomerCode(customerId)) {
            return res.status(400).json({ error: 'Enter a 4-digit code.' });
        }

        try {
            const result = await pool.query({
                text: `SELECT "customerId", "customerName", points
                    FROM "CustomerPoints"
                    WHERE "customerId" = $1`,
                values: [customerId],
                query_timeout: 5000
            });
            if (result.rowCount !== 1) {
                return res.status(404).json({ error: 'That code was not found.' });
            }
            const row = result.rows[0];
            res.json({
                customerId: row.customerId,
                customerName: row.customerName,
                points: Number(row.points),
                rewards: rewardList()
            });
        } catch (err) {
            console.error('Error checking in customer', err);
            res.status(500).json({ error: 'Unable to check in' });
        }
    });
    return router;
}

module.exports = { createCustomersRouter };
