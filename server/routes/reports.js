const express = require('express');
const { getSalesReport } = require('../services/sales');

function createReportsRouter({ pool, orderSchemaReady }) {
    const router = express.Router();
    router.get('/api/reports/sales', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        try {
            await orderSchemaReady;
            res.json(await getSalesReport(pool));
        } catch (err) {
            console.error('Error loading sales report', err);
            res.status(503).json({ error: 'Unable to load sales report. Please try again.' });
        }
    });
    return router;
}

module.exports = { createReportsRouter };
