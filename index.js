require('dotenv').config();
const { createApp } = require('./server/app');
const { createDatabase, initializeDatabase } = require('./server/database');

const port = process.env.PORT || 3000;
const { pool, missingDbEnv } = createDatabase();
const orderSchemaReady = initializeDatabase(pool);
const app = createApp({ pool, missingDbEnv, orderSchemaReady });

// Bind to Render's assigned port, or port 3000 locally.
if (require.main === module) {
    const server = app.listen(port, '0.0.0.0', () => {
        console.log(`Quality Boba listening on port ${port}`);
    });

    server.on('error', (err) => {
        console.error('Server failed to start:', err.message);
        process.exit(1);
    });

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
}

module.exports = { app, pool };
