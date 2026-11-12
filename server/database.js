const { Pool } = require('pg');
const { BUSINESS_TIME_ZONE } = require('./services/sales');
const { databaseQueryTimeout, requiredDbEnv } = require('./config');

function createDatabase() {
    const missingDbEnv = requiredDbEnv.filter((key) => !process.env[key]);

    if (missingDbEnv.length > 0) {
        console.error(
            `Missing database environment variables: ${missingDbEnv.join(', ')}. ` +
            'Configure them in your local .env file or Render environment settings.'
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
        connectionTimeoutMillis: 5000,
        query_timeout: 5000
    });

    pool.on('error', (err) => {
        console.error('Unexpected database pool error:', err);
    });

    return { pool, missingDbEnv };
}

function initializeDatabase(pool) {
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
              AND order_timestamp < (
                  (CURRENT_TIMESTAMP AT TIME ZONE '${BUSINESS_TIME_ZONE}')::date::timestamp
                  AT TIME ZONE '${BUSINESS_TIME_ZONE}' AT TIME ZONE 'UTC'
              );
        `,
        query_timeout: databaseQueryTimeout
    }).catch((err) => {
        console.error('Error preparing order status schema', err);
        throw err;
    });

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
                CREATE TABLE IF NOT EXISTS "CustomerPoints" (
                    id SERIAL PRIMARY KEY,
                    "customerId" VARCHAR(4) NOT NULL UNIQUE,
                    "customerName" VARCHAR(80) NOT NULL,
                    points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0)
                );
                INSERT INTO "CustomerPoints" ("customerId", "customerName", points)
                VALUES ('1234', 'aiden', 250)
                ON CONFLICT ("customerId") DO NOTHING;
            `);
            console.log('Order and inventory tables verified/initialized.');
        } catch (err) {
            console.warn('Could not initialize tables (TAMU DB may be offline/unreachable):', err.message);
        }
    }
    initOrderTables();

    return orderSchemaReady;
}

module.exports = { createDatabase, initializeDatabase };
