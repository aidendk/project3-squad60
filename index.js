const express = require('express');
const { Pool } = require('pg');
const path = require('node:path');
const { parsePrice, parseItemId, priceMessage } = require('./public/price-validation');
require('dotenv').config();
const app = express();
// Render assigns the public port in PORT. A hardcoded 3000 is unreachable there.
const port = process.env.PORT || 3000;
const databaseQueryTimeout = 15000;

app.set("view engine", "ejs");
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
const databaseHost = (process.env.PSQL_HOST || '').toLowerCase();
const isLocalDatabase = ['localhost', '127.0.0.1', '::1'].includes(databaseHost);
const sslSetting = process.env.PSQL_SSL === 'false'
    ? false
    : process.env.PSQL_SSL === 'true' || !isLocalDatabase
        ? { rejectUnauthorized: false }
        : false;

const pool = new Pool({
    user: process.env.PSQL_USER,
    host: process.env.PSQL_HOST,
    database: process.env.PSQL_DATABASE,
    password: process.env.PSQL_PASSWORD,
    port: process.env.PSQL_PORT,
    ssl: sslSetting,
    connectionTimeoutMillis: 5000
});

const orderSchemaReady = pool.query({
    text: `
        ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';
        ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'Cashier';
        CREATE INDEX IF NOT EXISTS orders_status_timestamp_idx
            ON orders (status, order_timestamp);
        CREATE INDEX IF NOT EXISTS order_item_order_id_idx
            ON order_item (order_id);
        UPDATE orders
        SET status = 'completed'
        WHERE status = 'pending'
          AND order_timestamp < CURRENT_DATE;
    `,
    query_timeout: databaseQueryTimeout
}).catch((err) => {
    console.error('Error preparing order status schema', err);
    throw err;
});

pool.on('error', (err) => {
    console.error('Unexpected database pool error', err);
});

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
	 	 	 	
app.set("view engine", "ejs");

// 1. Portal Hub (Home / Launchpad)
app.get('/', (req, res) => {
    res.render('index');
});

// 2. Customer Kiosk
app.get('/kiosk', (req, res) => {
    res.render('kiosk');
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

app.get('/api/kitchen/orders', async (req, res) => {
    try {
        await orderSchemaReady;
        const result = await pool.query({
            text: `
                SELECT
                    o.order_id,
                    o.source,
                    o.order_timestamp AS timestamp,
                    o.status,
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'name', m.name,
                                'quantity', oi.quantity
                            ) ORDER BY oi.order_item_id
                        ) FILTER (WHERE oi.order_item_id IS NOT NULL),
                        '[]'::json
                    ) AS items
                FROM orders o
                LEFT JOIN order_item oi ON oi.order_id = o.order_id
                LEFT JOIN menu_item m ON m.menu_item_id = oi.menu_item_id
                WHERE o.status = $1
                GROUP BY o.order_id, o.source, o.order_timestamp, o.status
                ORDER BY o.order_timestamp ASC
            `,
            values: ['pending'],
            query_timeout: databaseQueryTimeout
        });
        res.json(result.rows);
    } catch (err) {
        console.error('Error loading pending kitchen orders', err);
        res.status(503).json({ error: 'Unable to load pending orders. Please try again.' });
    }
});

app.patch('/api/kitchen/orders/:id', async (req, res) => {
    const id = parseItemId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Order ID must be a positive PostgreSQL integer.' });

    try {
        await orderSchemaReady;
        const result = await pool.query({
            text: "UPDATE orders SET status = 'completed' WHERE order_id = $1 AND status = 'pending' RETURNING order_id, status",
            values: [id],
            query_timeout: 5000
        });
        if (result.rowCount === 0) return res.status(404).json({ error: 'Order not found.' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error completing kitchen order', err);
        res.status(503).json({ error: 'Unable to complete the order. Please try again.' });
    }
});

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
