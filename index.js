const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');

const requiredDbEnv = [
    'PSQL_USER',
    'PSQL_HOST',
    'PSQL_DATABASE',
    'PSQL_PASSWORD',
    'PSQL_PORT'
];

const missingDbEnv = requiredDbEnv.filter((key) => !process.env[key]);

if (missingDbEnv.length > 0) {
    console.error(
        `Missing database environment variables: ${missingDbEnv.join(', ')}. ` +
        'Configure them in your local .env file or Render environment settings.'
    );
}

// Create the PostgreSQL connection pool.
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
    console.error('Unexpected database pool error:', err);
});

// Check whether PostgreSQL is configured and responding.
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

// Portal Hub
app.get('/', (req, res) => {
    res.render('index');
});

// Customer Kiosk
app.get('/kiosk', (req, res) => {
    res.render('kiosk');
});

// Cashier Screen
app.get('/cashier', (req, res) => {
    res.render('cashier');
});

// Manager Dashboard
app.get('/manager', (req, res) => {
    res.render('manager');
});

// Kitchen Display
app.get('/kitchen', (req, res) => {
    res.render('kitchen');
});

// Database team-members test
app.get('/user', async (req, res, next) => {
    try {
        const result = await pool.query('SELECT * FROM teammembers;');

        res.render('user', {
            teammembers: result.rows
        });
    } catch (err) {
        next(err);
    }
});

// Keep these handlers after all application routes.
app.use((req, res) => {
    if (req.path === '/api' || req.path.startsWith('/api/')) {
        return res.status(404).json({
            error: 'Not found'
        });
    }

    return res.status(404).render('error', {
        statusCode: 404,
        title: 'Page not found',
        message: 'The page you requested could not be found.'
    });
});

// Express error handlers require all four parameters.
app.use((err, req, res, next) => {
    console.error('Request failed:', err);

    if (res.headersSent) {
        return next(err);
    }

    if (
        req.path === '/api' ||
        req.path.startsWith('/api/') ||
        req.path === '/health'
    ) {
        return res.status(500).json({
            error: 'Internal server error'
        });
    }

    // Use a plain-text fallback if the error template cannot render.
    return res.status(500).render('error', {
        statusCode: 500,
        title: 'Something went wrong',
        message: 'We could not complete your request. Please try again later.'
    }, (renderErr, html) => {
        if (renderErr) {
            console.error('Error page rendering failed:', renderErr);
            return res.type('text').send('500 — Internal server error');
        }

        return res.send(html);
    });
});

// Bind to Render's assigned port, or port 3000 locally.
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Quality Boba listening on port ${port}`);
});

server.on('error', (err) => {
    console.error('Server failed to start:', err.message);
    process.exit(1);
});

// Close the HTTP server and database pool during shutdown.
let shuttingDown = false;

function shutdown() {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;
    console.log('Shutting down Quality Boba...');

    const timeout = setTimeout(() => {
        console.error('Shutdown timed out.');
        process.exit(1);
    }, 10000);

    timeout.unref();

    server.close(async (err) => {
        try {
            await pool.end();
            clearTimeout(timeout);

            if (err) {
                console.error('Server shutdown error:', err);
                process.exitCode = 1;
            } else {
                console.log('Application successfully shut down.');
            }
        } catch (poolErr) {
            console.error('Database shutdown error:', poolErr);
            process.exitCode = 1;
        }
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);