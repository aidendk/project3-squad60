const express = require('express');
const { categoryFor, categories } = require('../../public/js/shared/menu');

function createPagesRouter({ pool, menuSchemaReady = Promise.resolve() }) {
    const router = express.Router();
    router.get('/', (req, res) => {
        res.render('index');
    });

    router.get('/kiosk', (req, res) => {
        res.render('kiosk');
    });

    router.get('/cashier', (req, res) => {
        res.render('cashier');
    });

    router.get('/manager', async (req, res) => {
        const [menu, inventory] = await Promise.allSettled([
            menuSchemaReady.then(() => pool.query({
                text: 'SELECT menu_item_id, name, price, category FROM menu_item ORDER BY menu_item_id',
                query_timeout: 5000
            })),
            pool.query({
                // Reuse the Java inventory query.
                text: 'SELECT inventory_item_id, name, current_fill_level, reorder_threshold FROM inventory_item ORDER BY inventory_item_id',
                query_timeout: 5000
            })
        ]);
        const menuError = menu.status === 'rejected';
        const inventoryError = inventory.status === 'rejected';
        if (menuError) console.error('Error loading manager menu', menu.reason);
        if (inventoryError) console.error('Error loading manager inventory', inventory.reason);

        const inventoryItems = inventoryError ? [] : inventory.value.rows.map(item => ({
            ...item,
            // Match InventoryPanel's alert query and row styling: equality is not low stock.
            isLowStock: item.current_fill_level < item.reorder_threshold
        }));
        res.status(menuError || inventoryError ? 503 : 200).render('manager', {
            menuItems: menuError ? [] : menu.value.rows.map(item => ({ ...item, category: categoryFor(item.name, item.category) })),
            menuCategories: categories,
            menuError,
            inventoryItems,
            inventoryError,
            lowStockCount: inventoryError ? null : inventoryItems.filter(item => item.isLowStock).length
        });
    });

    router.get('/kitchen', (req, res) => {
        res.render('kitchen');
    });

    router.get('/user', async (req, res, next) => {
        try {
            const result = await pool.query('SELECT * FROM teammembers;');

            res.render('user', {
                teammembers: result.rows
            });
        } catch (err) {
            next(err);
        }
    });
    return router;
}

module.exports = { createPagesRouter };
