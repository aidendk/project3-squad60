const express = require('express');
const { parsePrice, parseItemId, priceMessage } = require('../../public/js/shared/price-validation');
const { validateMenuItem, validateMenuItemDetails } = require('../../public/js/shared/menu-item-validation');
const { createMenuItem, updateMenuItemDetails, deleteMenuItem } = require('../services/menu');
const { requireManager } = require('../auth');

function createMenuRouter({ pool, menuSchemaReady = Promise.resolve() }) {
    const router = express.Router();
    router.get('/api/menu', (req, res) => {
        menuSchemaReady.then(() => pool
            .query('SELECT menu_item_id, name, price, category FROM menu_item ORDER BY menu_item_id'))
            .then((query_res) => {
                const menu = query_res.rows.map((row) => ({
                    menu_item_id: row.menu_item_id,
                    name: row.name,
                    price: Number(row.price),
                    category: row.category
                }));
                res.json(menu);
            })
            .catch((err) => {
                console.error('Error loading menu', err);
                res.status(500).json({ error: 'Unable to load menu' });
            });
    });

    router.get('/api/menu/:id', requireManager, async (req, res) => {
        const id = parseItemId(req.params.id);
        if (id === null) return res.status(400).json({ error: 'Item ID must be a positive PostgreSQL integer.' });
        try {
            await menuSchemaReady;
            const result = await pool.query({
                text: `SELECT m.menu_item_id, m.name, m.price, m.category,
                    COALESCE((SELECT json_agg(json_build_object('inventory_item_id', r.inventory_item_id,
                        'name', i.name, 'quantity_required', r.quantity_required) ORDER BY r.recipe_id)
                        FROM recipe r JOIN inventory_item i USING (inventory_item_id)
                        WHERE r.menu_item_id = m.menu_item_id), '[]'::json) AS ingredients
                    FROM menu_item m WHERE m.menu_item_id = $1`,
                values: [id], query_timeout: 5000
            });
            if (!result.rowCount) return res.status(404).json({ error: 'Menu item not found. Reload the menu.' });
            res.json({ ...result.rows[0], price: Number(result.rows[0].price) });
        } catch (error) {
            console.error('Error loading menu details', error);
            res.status(503).json({ error: 'Unable to load item details. Please reload the menu.' });
        }
    });

    router.delete('/api/menu/:id', requireManager, async (req, res) => {
        const id = parseItemId(req.params.id);
        if (id === null) return res.status(400).json({ error: 'Item ID must be a positive PostgreSQL integer.' });
        try {
            await menuSchemaReady;
            res.json(await deleteMenuItem(pool, id));
        } catch (error) {
            if ([404, 409].includes(error.status)) return res.status(error.status).json({ error: error.message });
            console.error('Error deleting menu item', error);
            res.status(503).json({ error: 'Unable to confirm deletion. Reload the menu before trying again.' });
        }
    });

    router.patch('/api/menu/:id', requireManager, async (req, res) => {
        const id = parseItemId(req.params.id);
        if (id === null) return res.status(400).json({ error: 'Item ID must be a positive PostgreSQL integer.' });
        const { item, error } = validateMenuItemDetails(req.body);
        if (error) return res.status(400).json({ error });
        try {
            await menuSchemaReady;
            res.json(await updateMenuItemDetails(pool, id, item));
        } catch (err) {
            if ([400, 404, 409].includes(err.status)) return res.status(err.status).json({ error: err.message });
            console.error('Error updating menu details', err);
            res.status(503).json({ error: 'Unable to confirm the changes were saved. Reload the menu before trying again.' });
        }
    });

    router.post('/api/menu', requireManager, async (req, res) => {
        const { item, error } = validateMenuItem(req.body);
        if (error) return res.status(400).json({ error });
        try {
            res.status(201).json(await createMenuItem(pool, item));
        } catch (err) {
            if (err.status === 400 || err.status === 409) return res.status(err.status).json({ error: err.message });
            console.error('Error creating menu item', err);
            res.status(503).json({ error: 'Unable to confirm the new item was saved. Reload the menu before trying again.' });
        }
    });

    router.put('/api/menu/:id', requireManager, express.json({ limit: '1kb' }), async (req, res) => {
        const id = parseItemId(req.params.id);
        if (id === null) return res.status(400).json({ error: 'Item ID must be a positive PostgreSQL integer.' });
        const price = parsePrice(req.body?.price);
        if (price === null) return res.status(400).json({ error: priceMessage });

        try {
            await menuSchemaReady;
            const result = await pool.query({
                text: 'UPDATE menu_item SET price = $1 WHERE menu_item_id = $2 RETURNING menu_item_id, name, price, category',
                values: [price, id],
                query_timeout: 5000
            });
            if (result.rowCount === 0) return res.status(404).json({ error: 'Menu item not found. Reload the menu to see current items.' });
            res.json(result.rows[0]);
        } catch (err) {
            console.error('Error updating menu price', err);
            res.status(503).json({ error: 'Unable to save the price. Please try again. If the connection was lost, reload the menu to check its current price.' });
        }
    });
    return router;
}

module.exports = { createMenuRouter };
