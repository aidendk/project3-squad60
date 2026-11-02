const express = require('express');
const { Pool } = require('pg');
const path = require('node:path');
const { parsePrice, parseItemId, priceMessage } = require('./public/price-validation');
require('dotenv').config();
const app = express();
// Render assigns the public port in PORT. A hardcoded 3000 is unreachable there.
const port = process.env.PORT || 3000;

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
    try {
        const result = await pool.query({
            text: 'SELECT menu_item_id, name, price FROM menu_item ORDER BY menu_item_id',
            query_timeout: 5000
        });
        res.render('manager', { menuItems: result.rows, menuError: false });
    } catch (err) {
        console.error('Error loading manager menu', err);
        res.status(503).render('manager', { menuItems: [], menuError: true });
    }
});

// 5. Kitchen Display
app.get('/kitchen', (req, res) => {
    res.render('kitchen');
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
