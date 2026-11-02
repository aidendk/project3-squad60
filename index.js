const express = require('express');
const { Pool } = require('pg');
const path = require('node:path');
const { parsePrice, parseItemId, priceMessage } = require('./public/price-validation');
require('dotenv').config();
const app = express();
// Render assigns the public port in PORT. A hardcoded 3000 is unreachable there.
const port = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.use(express.json());
app.use('/js', express.static(path.join(__dirname, 'public')));

const requiredDbEnv = ['PSQL_USER', 'PSQL_HOST', 'PSQL_DATABASE', 'PSQL_PASSWORD', 'PSQL_PORT'];
const missingDbEnv = requiredDbEnv.filter((key) => !process.env[key]);
if (missingDbEnv.length > 0) {
    console.error(
        `Missing database environment variables: ${missingDbEnv.join(', ')}. ` +
        'pg then connects to localhost:5432, which is not running on Render. ' +
        'Add these in the Render Environment tab. The local .env file is not deployed.'
    );
}

// Create pool
const pool = new Pool({
    user: process.env.PSQL_USER,
    host: process.env.PSQL_HOST,
    database: process.env.PSQL_DATABASE,
    password: process.env.PSQL_PASSWORD,
    port: process.env.PSQL_PORT,
    ssl: {rejectUnauthorized: false},
    connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
    console.error('Unexpected database pool error', err);
});

// Initialize order and inventory tables if they do not exist
async function initOrderTables() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                order_id SERIAL PRIMARY KEY,
                cashier_id VARCHAR(50),
                payment_method VARCHAR(20),
                subtotal NUMERIC(10, 2),
                tax NUMERIC(10, 2),
                total NUMERIC(10, 2),
                order_status VARCHAR(20) DEFAULT 'Pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS order_items (
                item_id SERIAL PRIMARY KEY,
                order_id INT REFERENCES orders(order_id) ON DELETE CASCADE,
                code VARCHAR(20),
                name VARCHAR(100),
                size VARCHAR(20),
                sugar VARCHAR(20),
                ice VARCHAR(20),
                quantity INT,
                unit_price NUMERIC(10, 2),
                line_total NUMERIC(10, 2)
            );
            CREATE TABLE IF NOT EXISTS inventory_item (
                inventory_item_id SERIAL PRIMARY KEY,
                name VARCHAR(100),
                current_fill_level INT DEFAULT 100,
                reorder_threshold INT DEFAULT 20
            );
        `);
        console.log('Order and inventory tables verified/initialized.');
    } catch (err) {
        console.warn('Could not initialize tables (TAMU DB may be offline/unreachable):', err.message);
    }
}
initOrderTables();

// The orders table requires an employee. Kiosk sales are recorded under the manager.
const KIOSK_EMPLOYEE_ID = 1;
const SALES_TAX_RATE = 0.0825;
const KIOSK_PAYMENT_METHOD = 'Card';

function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

async function insertKioskOrder({ items, totalPrice, tax }) {
    for (let attempt = 1; attempt <= 5; attempt++) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const orderResult = await client.query({
                text: `INSERT INTO orders (
                    order_id, employee_id, order_timestamp, total_price, tax, tip, payment_method
                )
                VALUES (
                    (SELECT COALESCE(MAX(order_id), 0) + 1 FROM orders),
                    $1, NOW(), $2, $3, 0, $4
                )
                RETURNING order_id`,
                values: [KIOSK_EMPLOYEE_ID, totalPrice, tax, KIOSK_PAYMENT_METHOD],
                query_timeout: 5000
            });
            const orderId = orderResult.rows[0].order_id;

            for (const item of items) {
                await client.query({
                    text: `INSERT INTO order_item (order_item_id, order_id, menu_item_id, quantity)
                        VALUES (
                            (SELECT COALESCE(MAX(order_item_id), 0) + 1 FROM order_item),
                            $1, $2, $3
                        )`,
                    values: [orderId, item.menu_item_id, item.quantity],
                    query_timeout: 5000
                });
            }

            await client.query('COMMIT');
            return { order_id: orderId };
        } catch (err) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackErr) {
                console.error('Error rolling back kiosk order', rollbackErr);
            }
            if (err.code === '23505' && attempt < 5) {
                continue;
            }
            throw err;
        } finally {
            client.release();
        }
    }

    throw new Error('Unable to allocate an order id');
}

if (require.main === module) {
    app.listen(port, '0.0.0.0', () => {
        console.log(`Example app listening on port ${port}`);
    });

    process.on('SIGINT', function() {
        pool.end();
        console.log('Application successfully shutdown');
        process.exit(0);
    });
}
	 	 	 	
// 1. Portal Hub (Home / Launchpad)
app.get('/', (req, res) => {
    res.render('index');
});

// 2. Customer Kiosk
app.get('/kiosk', (req, res) => {
    res.render('kiosk');
});

// Drinks and prices come from menu_item rather than a hardcoded list.
app.get('/api/menu', (req, res) => {
    pool
        .query('SELECT menu_item_id, name, price FROM menu_item ORDER BY menu_item_id')
        .then((query_res) => {
            const menu = query_res.rows.map((row) => ({
                menu_item_id: row.menu_item_id,
                name: row.name,
                price: Number(row.price)
            }));
            res.json(menu);
        })
        .catch((err) => {
            console.error('Error loading menu', err);
            res.status(500).json({ error: 'Unable to load menu' });
        });
});

// customer_name and order_source are required by the kiosk. The orders table has
// no columns for them, so the sale is stored with the required employee, tax,
// total, and payment columns, and each drink goes in order_item.
app.post('/api/orders', express.json({ limit: '100kb' }), async (req, res) => {
    const { items, customer_name, total_price, order_source } = req.body || {};
    const customerName = typeof customer_name === 'string' ? customer_name.trim() : '';

    if (order_source !== 'kiosk') {
        return res.status(400).json({ error: 'order_source must be kiosk' });
    }
    if (!customerName || customerName.length > 80) {
        return res.status(400).json({ error: 'customer_name is required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items are required' });
    }

    const mergedItems = new Map();
    for (const item of items) {
        const menuItemId = Number(item && item.menu_item_id);
        const quantity = Number(item && item.quantity);
        if (!Number.isInteger(menuItemId) || menuItemId <= 0) {
            return res.status(400).json({ error: 'Each item needs a menu_item_id' });
        }
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
            return res.status(400).json({ error: 'Each item quantity must be from 1 to 20' });
        }
        const nextQuantity = (mergedItems.get(menuItemId) || 0) + quantity;
        if (nextQuantity > 20) {
            return res.status(400).json({ error: 'Each item quantity must be from 1 to 20' });
        }
        mergedItems.set(menuItemId, nextQuantity);
    }

    try {
        const menuResult = await pool.query({
            text: 'SELECT menu_item_id, name, price FROM menu_item WHERE menu_item_id = ANY($1::int[])',
            values: [[...mergedItems.keys()]],
            query_timeout: 5000
        });
        if (menuResult.rowCount !== mergedItems.size) {
            return res.status(400).json({ error: 'One or more drinks are not on the menu' });
        }

        const pricedItems = menuResult.rows.map((row) => ({
            menu_item_id: row.menu_item_id,
            name: row.name,
            price: Number(row.price),
            quantity: mergedItems.get(row.menu_item_id)
        }));
        const subtotal = roundMoney(
            pricedItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
        );
        const tax = roundMoney(subtotal * SALES_TAX_RATE);
        const expectedTotal = roundMoney(subtotal + tax);

        if (roundMoney(total_price) !== expectedTotal) {
            return res.status(400).json({
                error: 'total_price does not match the menu total',
                expected_total: expectedTotal
            });
        }

        const savedOrder = await insertKioskOrder({
            items: pricedItems,
            totalPrice: expectedTotal,
            tax
        });

        res.status(201).json({
            order_id: savedOrder.order_id,
            customer_name: customerName,
            order_source: 'kiosk',
            items: pricedItems,
            subtotal,
            tax,
            total_price: expectedTotal
        });
    } catch (err) {
        console.error('Error saving kiosk order', err);
        res.status(500).json({ error: 'Unable to save order' });
    }
});

app.use('/api/orders', (err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Send a valid JSON order.' });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Order request is too large.' });
    }
    next(err);
});

// 3. Cashier Screen
app.get('/cashier', (req, res) => {
    res.render('cashier');
});

// 4. Manager Dashboard
app.get('/manager', async (req, res) => {
    const [menu, inventory] = await Promise.allSettled([
        pool.query({
            text: 'SELECT menu_item_id, name, price FROM menu_item ORDER BY menu_item_id',
            query_timeout: 5000
        }),
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
        menuItems: menuError ? [] : menu.value.rows,
        menuError,
        inventoryItems,
        inventoryError,
        lowStockCount: inventoryError ? null : inventoryItems.filter(item => item.isLowStock).length
    });
});

// 5. Kitchen Display
app.get('/kitchen', (req, res) => {
    res.render('kitchen');
});

// Manager Menu Update API
app.put('/api/menu/:id', express.json({ limit: '1kb' }), async (req, res) => {
    const id = parseItemId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Item ID must be a positive PostgreSQL integer.' });
    const price = parsePrice(req.body?.price);
    if (price === null) return res.status(400).json({ error: priceMessage });

    try {
        const result = await pool.query({
            text: 'UPDATE menu_item SET price = $1 WHERE menu_item_id = $2 RETURNING menu_item_id, name, price',
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

app.use('/api/menu', (err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Send a valid JSON object containing a price.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Price request is too large.' });
    next(err);
});

// Task 4 & Task 5: Transactional Order Submission API with Automated Inventory Stock Deduction
app.post('/api/cashier/order', async (req, res) => {
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

        // 1. Insert master order row
        const orderInsertSql = `
            INSERT INTO orders (cashier_id, payment_method, subtotal, tax, total, order_status, created_at)
            VALUES ($1, $2, $3, $4, $5, 'Pending', NOW())
            RETURNING order_id, total, created_at;
        `;
        const orderResult = await client.query(orderInsertSql, [
            cashier_id || 'Reveille',
            payment_method || 'Card',
            subtotal || 0,
            tax || 0,
            total
        ]);

        const newOrderId = orderResult.rows[0].order_id;

        // 2. Insert line items
        const itemInsertSql = `
            INSERT INTO order_items (order_id, code, name, size, sugar, ice, quantity, unit_price, line_total)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
        `;

        for (const item of items) {
            await client.query(itemInsertSql, [
                newOrderId,
                item.code || 'CUSTOM',
                item.name,
                item.size || 'Regular',
                item.sugar || '100%',
                item.ice || 'Regular Ice',
                item.quantity || 1,
                item.unit_price || 0,
                item.line_total || 0
            ]);
        }

        // 3. Automated Inventory Stock Deduction (Task 5)
        for (const item of items) {
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

// Database Team Members Test Route
app.get('/user', (req, res) => {
    const teammembers = [];
    pool
        .query('SELECT * FROM teammembers;')
        .then(query_res => {
            for (let i = 0; i < query_res.rowCount; i++){
                teammembers.push(query_res.rows[i]);
            }
            const data = {teammembers: teammembers};
            console.log(teammembers);
            res.render('user', data);
        })
        .catch(err => {
            console.error('Error executing query', err);
            res.status(500).send('Error executing query');
        });
});

module.exports = { app, pool };
