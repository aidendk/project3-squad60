const express = require('express');

function createHealthRouter({ pool, missingDbEnv }) {
    const router = express.Router();
    router.get('/health', async (req, res) => {
        res.set('Cache-Control', 'no-store');

        if (missingDbEnv.length > 0) {
            return res.status(503).json({
                status: 'unavailable',
                database: 'not configured'
            });
        }

        try {
            await pool.query('SELECT 1');

            return res.status(200).json({
                status: 'ok',
                database: 'connected'
            });
        } catch (err) {
            console.error('Database health check failed:', err.message);

            return res.status(503).json({
                status: 'unavailable',
                database: 'disconnected'
            });
        }
    });
    return router;
}

module.exports = { createHealthRouter };
