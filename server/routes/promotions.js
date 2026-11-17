const express = require('express');
const { requireManager } = require('../auth');
const { parseItemId } = require('../../public/js/shared/price-validation');
const { validatePromotion, listPromotions } = require('../services/promotions');

function createPromotionsRouter({ pool, promotionsSchemaReady = Promise.resolve() }) {
    const router = express.Router();
    router.use(['/api/promotions', '/api/manager/promotions'], (req, res, next) => {
        res.set('Cache-Control', 'no-store');
        next();
    });
    router.get('/api/promotions/active', async (req, res) => {
        try {
            await promotionsSchemaReady;
            res.json(await listPromotions(pool, { activeOnly: true }));
        } catch (error) {
            console.error('Error loading active promotions', error);
            res.status(503).json({ error: 'Deals could not be checked. Please try again.' });
        }
    });
    router.get('/api/manager/promotions', requireManager, async (req, res) => {
        try {
            await promotionsSchemaReady;
            res.json(await listPromotions(pool));
        } catch (error) {
            console.error('Error loading manager promotions', error);
            res.status(503).json({ error: 'Unable to load promotions. Please reload.' });
        }
    });
    router.post('/api/manager/promotions', requireManager, async (req, res) => {
        const { promotion, error } = validatePromotion(req.body);
        if (error) return res.status(400).json({ error });
        try {
            await promotionsSchemaReady;
            const result = await pool.query({
                text: `INSERT INTO promotions (title, promo_type, discount_value, target_category,
                    day_of_week, start_time, end_time, start_date, end_date, is_active)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING promo_id`,
                values: [promotion.title, promotion.promo_type, promotion.discount_value, promotion.target_category,
                    promotion.day_of_week, promotion.start_time, promotion.end_time, promotion.start_date, promotion.end_date, promotion.is_active],
                query_timeout: 5000
            });
            res.status(201).json({ ...promotion, promo_id: result.rows[0].promo_id });
        } catch (error) {
            console.error('Error creating promotion', error);
            res.status(503).json({ error: 'Unable to confirm the deal was saved. Reload the list before trying again.' });
        }
    });
    router.patch('/api/manager/promotions/:id/toggle', requireManager, async (req, res) => {
        const id = parseItemId(req.params.id);
        if (id === null) return res.status(400).json({ error: 'Promotion ID must be a positive integer.' });
        try {
            await promotionsSchemaReady;
            const result = await pool.query({
                text: 'UPDATE promotions SET is_active = NOT is_active WHERE promo_id = $1 RETURNING promo_id, is_active',
                values: [id], query_timeout: 5000
            });
            if (!result.rowCount) return res.status(404).json({ error: 'Promotion not found. Reload the list.' });
            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error toggling promotion', error);
            res.status(503).json({ error: 'Unable to confirm the change. Reload the list before trying again.' });
        }
    });
    return router;
}

module.exports = { createPromotionsRouter };
