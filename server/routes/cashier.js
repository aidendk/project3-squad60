const express = require('express');
const { deductRecipeInventory } = require('../services/menu');

function createCashierRouter({ pool }) {
    const router = express.Router();
    router.post('/api/cashier/order', async (req, res) => {
        const { cashier_id, payment_method, items, subtotal, tax, total } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Order must contain at least one item.' });
        }

        if (total === undefined || isNaN(parseFloat(total))) {
            return res.status(400).json({ error: 'Order must contain a valid total.' });
        }

        let client;
        try {
            client = await pool.connect();
        } catch (connErr) {
            console.error('Database connection error in POST /api/cashier/order:', connErr.message);
            return res.status(503).json({
                error: 'Database connection failed. Ensure TAMU VPN is active if connecting to TAMU AWS.',
                details: connErr.message
            });
        }

        try {
            // Begin Transaction
            await client.query('BEGIN');

            // 1. Insert master order row matching the real orders table schema
            const orderResult = await client.query({
                text: `INSERT INTO orders (
                    order_id, employee_id, order_timestamp, total_price, tax, tip, payment_method, status, source
                )
                VALUES (
                    (SELECT COALESCE(MAX(order_id), 0) + 1 FROM orders),
                    $1, (NOW() AT TIME ZONE 'UTC'), $2, $3, 0, $4, 'pending', 'Cashier'
                )
                RETURNING order_id, total_price, order_timestamp`,
                values: [1, parseFloat(total) || 0, parseFloat(tax) || 0, payment_method || 'Card'],
                query_timeout: 5000
            });

            const newOrderId = orderResult.rows[0].order_id;

            // 2. Fetch menu items to map item names or menu_item_ids
            const menuResult = await client.query({
                text: 'SELECT menu_item_id, LOWER(name) AS lower_name, name, price FROM menu_item',
                query_timeout: 5000
            });
            const menuRows = menuResult.rows;

            function findMenuItemId(item) {
                if (item.menu_item_id && Number.isInteger(Number(item.menu_item_id))) {
                    return Number(item.menu_item_id);
                }
                const target = (item.name || '').trim().toLowerCase();
                const exact = menuRows.find(m => m.lower_name === target);
                if (exact) return exact.menu_item_id;

                const partial = menuRows.find(m => target.includes(m.lower_name) || m.lower_name.includes(target));
                if (partial) return partial.menu_item_id;

                return menuRows[0]?.menu_item_id || 1;
            }

            // 3. Insert line items into order_item (singular, matching KDS and DB schema)
            const resolvedItems = [];
            for (const item of items) {
                const menuItemId = findMenuItemId(item);
                const qty = parseInt(item.quantity, 10) || 1;
                resolvedItems.push({ ...item, menu_item_id: menuItemId, quantity: qty });

                await client.query({
                    text: `INSERT INTO order_item (order_item_id, order_id, menu_item_id, quantity)
                        VALUES (
                            (SELECT COALESCE(MAX(order_item_id), 0) + 1 FROM order_item),
                            $1, $2, $3
                        )`,
                    values: [newOrderId, menuItemId, qty],
                    query_timeout: 5000
                });
            }

            // Prefer exact recipe quantities; retain the fallback for legacy items
            // without recipes. Never apply both methods to the same drink.
            const recipeItemIds = await deductRecipeInventory(client, resolvedItems);
            for (const item of resolvedItems) {
                if (recipeItemIds.has(item.menu_item_id)) continue;
                const qty = parseInt(item.quantity, 10) || 1;
                const itemNameLower = (item.name || '').toLowerCase();
                const itemCodeLower = (item.code || '').toLowerCase();

                // A. Deduct Cups for every ordered drink
                await client.query(`
                    UPDATE inventory_item
                    SET current_fill_level = GREATEST(0, current_fill_level - $1)
                    WHERE LOWER(name) LIKE '%cup%';
                `, [qty]);

                // B. Deduct Boba / Pearls if drink or toppings use pearls
                if (itemNameLower.includes('pearl') || itemNameLower.includes('boba') || itemCodeLower.includes('tp-01')) {
                    await client.query(`
                        UPDATE inventory_item
                        SET current_fill_level = GREATEST(0, current_fill_level - $1)
                        WHERE LOWER(name) LIKE '%boba%' OR LOWER(name) LIKE '%pearl%' OR LOWER(name) LIKE '%tapioca%';
                    `, [qty]);
                }

                // C. Deduct Milk for milk teas and specialty dairy
                if (itemNameLower.includes('milk') || itemNameLower.includes('latte')) {
                    await client.query(`
                        UPDATE inventory_item
                        SET current_fill_level = GREATEST(0, current_fill_level - $1)
                        WHERE LOWER(name) LIKE '%milk%' OR LOWER(name) LIKE '%dairy%';
                    `, [qty]);
                }

                // D. Deduct Tea Base
                if (itemNameLower.includes('tea') || itemNameLower.includes('oolong') || itemNameLower.includes('matcha')) {
                    await client.query(`
                        UPDATE inventory_item
                        SET current_fill_level = GREATEST(0, current_fill_level - $1)
                        WHERE LOWER(name) LIKE '%tea%' OR LOWER(name) LIKE '%leaves%';
                    `, [qty]);
                }

                // E. Deduct Taro
                if (itemNameLower.includes('taro')) {
                    await client.query(`
                        UPDATE inventory_item
                        SET current_fill_level = GREATEST(0, current_fill_level - $1)
                        WHERE LOWER(name) LIKE '%taro%';
                    `, [qty]);
                }

                // F. Deduct Pudding & Jelly
                if (itemNameLower.includes('pudding') || itemCodeLower.includes('tp-02')) {
                    await client.query(`
                        UPDATE inventory_item
                        SET current_fill_level = GREATEST(0, current_fill_level - $1)
                        WHERE LOWER(name) LIKE '%pudding%';
                    `, [qty]);
                }
                if (itemNameLower.includes('jelly') || itemCodeLower.includes('tp-03')) {
                    await client.query(`
                        UPDATE inventory_item
                        SET current_fill_level = GREATEST(0, current_fill_level - $1)
                        WHERE LOWER(name) LIKE '%jelly%';
                    `, [qty]);
                }
            }

            // Check for low stock warnings after deduction
            const lowStockCheck = await client.query(`
                SELECT name, current_fill_level, reorder_threshold
                FROM inventory_item
                WHERE current_fill_level <= reorder_threshold;
            `);

            if (lowStockCheck.rowCount > 0) {
                console.warn(`[Inventory Alert] Low stock detected after Order #${newOrderId}:`,
                    lowStockCheck.rows.map(r => `${r.name} (${r.current_fill_level}/${r.reorder_threshold})`).join(', ')
                );
            }

            // Commit Transaction (Atomically commits master order, line items, and inventory deductions)
            await client.query('COMMIT');

            console.log(`Order #${newOrderId} committed successfully with inventory stock deducted.`);

            res.status(201).json({
                success: true,
                order_id: newOrderId,
                message: `Order #${newOrderId} placed successfully and inventory updated!`,
                low_stock_alerts: lowStockCheck.rows,
                order: orderResult.rows[0]
            });

        } catch (txErr) {
            console.error('Transaction error in POST /api/cashier/order, rolling back:', txErr);
            try {
                await client.query('ROLLBACK');
            } catch (rbErr) {
                console.error('Error during ROLLBACK:', rbErr);
            }

            res.status(500).json({
                error: 'Failed to process order transaction.',
                details: txErr.message
            });
        } finally {
            if (client) {
                client.release();
            }
        }
    });
    return router;
}

module.exports = { createCashierRouter };
