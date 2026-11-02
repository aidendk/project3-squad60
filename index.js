const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();
const app = express();
// Render assigns the public port in PORT. A hardcoded 3000 is unreachable there.
const port = process.env.PORT || 3000;

app.set("view engine", "ejs");

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
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
    query_timeout: 5000
});

pool.on('error', (err) => {
    console.error('Unexpected database pool error', err);
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Example app listening on port ${port}`);
});

process.on('SIGINT', function() {
    pool.end();
    console.log('Application successfully shutdown');
    process.exit(0);
});
	 	 	 	
app.get('/health', async (req, res) => {
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
app.get('/manager', (req, res) => {
    res.render('manager');
});

// 5. Kitchen Display
app.get('/kitchen', (req, res) => {
    res.render('kitchen');
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
