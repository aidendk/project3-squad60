const express = require('express');
const path = require('node:path');
const { createPagesRouter } = require('./routes/pages');
const { createHealthRouter } = require('./routes/health');
const { createCustomersRouter } = require('./routes/customers');
const { createMenuRouter } = require('./routes/menu');
const { createKioskOrdersRouter } = require('./routes/kiosk-orders');
const { createCashierRouter } = require('./routes/cashier');
const { createKitchenRouter } = require('./routes/kitchen');
const { createReportsRouter } = require('./routes/reports');
const { createChatRouter } = require('./routes/chat');
const { orderJsonError, menuJsonError, notFound, errorHandler } = require('./middleware/errors');

// Construction is separate from startup so checks can use a fake database.
function createApp({ pool, orderSchemaReady = Promise.resolve(), menuSchemaReady = Promise.resolve(), missingDbEnv = [], chatClient, chatApiKey } = {}) {
    const app = express();
    const publicDirectory = path.join(__dirname, '..', 'public');
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', 'views'));
    app.use(express.json());
    app.use('/css', express.static(path.join(publicDirectory, 'css')));
    app.use('/js', express.static(path.join(publicDirectory, 'js')));
    app.use('/images', express.static(path.join(publicDirectory, 'images')));
    app.get('/js/vendor/markdown-it.min.js', (req, res) => res.sendFile(require.resolve('markdown-it/browser')));

    const dependencies = { pool, orderSchemaReady, menuSchemaReady, missingDbEnv };
    app.use(createHealthRouter(dependencies));
    app.use(createPagesRouter(dependencies));
    app.use('/api/kiosk/chat', createChatRouter({ pool, menuSchemaReady, client: chatClient, apiKey: chatApiKey }));
    app.use(createCustomersRouter(dependencies));
    app.use(createMenuRouter(dependencies));
    app.use(createKioskOrdersRouter(dependencies));
    app.use(createCashierRouter(dependencies));
    app.use(createKitchenRouter(dependencies));
    app.use(createReportsRouter(dependencies));

    // Keep API-specific parser errors and the final fallbacks after the routes.
    app.use('/api/orders', orderJsonError);
    app.use('/api/menu', menuJsonError);
    app.use(notFound);
    app.use(errorHandler);
    return app;
}

module.exports = { createApp };
