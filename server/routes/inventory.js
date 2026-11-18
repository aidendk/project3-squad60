const express = require('express');
const { requireManager } = require('../auth');
const { parseItemId } = require('../../public/js/shared/price-validation');

function validateInventoryItem(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).some(key => !['name', 'current_fill_level', 'reorder_threshold'].includes(key))) {
        return { error: 'Send the ingredient name, current quantity, and reorder threshold.' };
    }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || [...name].length > 100 || name.includes('\0')) return { error: 'Ingredient name must contain 1 to 100 characters.' };
    for (const key of ['current_fill_level', 'reorder_threshold']) {
        if (!Number.isInteger(body[key]) || body[key] < 0 || body[key] > 2147483647) {
            return { error: 'Quantity and reorder threshold must be whole numbers from 0 to 2,147,483,647.' };
        }
    }
    return { item: { name, current_fill_level: body.current_fill_level, reorder_threshold: body.reorder_threshold } };
}

function createInventoryRouter({ pool }) {
    const router = express.Router();
    router.post('/api/manager/inventory', requireManager, async (req, res) => {
        const { item, error } = validateInventoryItem(req.body);
        if (error) return res.status(400).json({ error });
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            await client.query("SET LOCAL lock_timeout = '5s'");
            // Support the existing inventory IDs, including databases without a sequence.
            // Serialize name checks and ID allocation across ingredient creation requests.
            await client.query('LOCK TABLE inventory_item IN SHARE ROW EXCLUSIVE MODE');
            const duplicate = await client.query({
                text: 'SELECT inventory_item_id FROM inventory_item WHERE LOWER(BTRIM(name)) = LOWER($1)',
                values: [item.name], query_timeout: 5000
            });
            if (duplicate.rowCount) throw Object.assign(new Error('An ingredient with that name already exists. Edit its stock quantity or choose a different name.'), { status: 409 });
            const result = await client.query({
                text: `INSERT INTO inventory_item (inventory_item_id, name, current_fill_level, reorder_threshold)
                    VALUES ((SELECT COALESCE(MAX(inventory_item_id), 0) + 1 FROM inventory_item), $1, $2, $3)
                    RETURNING inventory_item_id, name, current_fill_level, reorder_threshold`,
                values: [item.name, item.current_fill_level, item.reorder_threshold], query_timeout: 5000
            });
            await client.query('COMMIT');
            res.status(201).json(result.rows[0]);
        } catch (error) {
            if (client) {
                try { await client.query('ROLLBACK'); } catch (rollbackError) { console.error('Error rolling back ingredient creation', rollbackError); }
            }
            if (error.status === 409) return res.status(409).json({ error: error.message });
            console.error('Error adding inventory ingredient', error);
            res.status(503).json({ error: 'Unable to confirm the ingredient was added. Reload inventory before trying again.' });
        } finally { client?.release(); }
    });
    router.patch('/api/manager/inventory/:id', requireManager, async (req, res) => {
        const id = parseItemId(req.params.id);
        if (id === null) return res.status(400).json({ error: 'Ingredient ID must be a positive integer.' });
        const { item, error } = validateInventoryItem(req.body);
        if (error) return res.status(400).json({ error });
        try {
            const result = await pool.query({
                text: `UPDATE inventory_item SET name = $1, current_fill_level = $2, reorder_threshold = $3
                    WHERE inventory_item_id = $4 RETURNING inventory_item_id, name, current_fill_level, reorder_threshold`,
                values: [item.name, item.current_fill_level, item.reorder_threshold, id], query_timeout: 5000
            });
            if (!result.rowCount) return res.status(404).json({ error: 'Ingredient not found. Reload inventory.' });
            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating inventory', error);
            res.status(503).json({ error: 'Unable to confirm the changes were saved. Reload inventory before trying again.' });
        }
    });
    router.delete('/api/manager/inventory/:id', requireManager, async (req, res) => {
        const id = parseItemId(req.params.id);
        if (id === null) return res.status(400).json({ error: 'Ingredient ID must be a positive integer.' });
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            await client.query("SET LOCAL lock_timeout = '5s'");
            // Recipe creation and editing use this same lock order.
            await client.query('LOCK TABLE menu_item, recipe IN SHARE ROW EXCLUSIVE MODE');
            const existing = await client.query({ text: 'SELECT inventory_item_id FROM inventory_item WHERE inventory_item_id = $1 FOR UPDATE', values: [id], query_timeout: 5000 });
            if (!existing.rowCount) throw Object.assign(new Error('Ingredient not found. Reload inventory.'), { status: 404 });
            const recipe = await client.query({ text: 'SELECT 1 FROM recipe WHERE inventory_item_id = $1 LIMIT 1', values: [id], query_timeout: 5000 });
            if (recipe.rowCount) throw Object.assign(new Error('This ingredient is used in a menu recipe. Remove it from those recipes before deleting it.'), { status: 409 });
            await client.query({ text: 'DELETE FROM inventory_item WHERE inventory_item_id = $1', values: [id], query_timeout: 5000 });
            await client.query('COMMIT');
            res.json({ inventory_item_id: id });
        } catch (error) {
            if (client) {
                try { await client.query('ROLLBACK'); } catch (rollbackError) { console.error('Error rolling back inventory deletion', rollbackError); }
            }
            if (error.status) return res.status(error.status).json({ error: error.message });
            if (error.code === '23503') return res.status(409).json({ error: 'This ingredient is referenced by another record and cannot be deleted.' });
            console.error('Error deleting inventory', error);
            res.status(503).json({ error: 'Unable to confirm deletion. Reload inventory before trying again.' });
        } finally { client?.release(); }
    });
    return router;
}

module.exports = { createInventoryRouter, validateInventoryItem };
