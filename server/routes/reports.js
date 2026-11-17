const express = require('express');
const { getSalesReport, getItemSalesReport, resolveSalesRange, SalesRangeError } = require('../services/sales');
const { requireManager } = require('../auth');

function createReportsRouter({ pool, orderSchemaReady }) {
    const router = express.Router();
    const report = service => async (req, res) => {
        res.set('Cache-Control', 'no-store');
        try {
            const range = resolveSalesRange(req.query);
            await orderSchemaReady;
            res.json(await service(pool, range));
        } catch (err) {
            if (err instanceof SalesRangeError) return res.status(400).json({ error: err.message });
            console.error('Error loading sales report', err);
            res.status(503).json({ error: 'Unable to load sales report. Please try again.' });
        }
    };
    router.get('/api/reports/sales', requireManager, report(getSalesReport));
    router.get('/api/reports/sales/items', requireManager, report(getItemSalesReport));
    return router;
}

module.exports = { createReportsRouter };
