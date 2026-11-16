const orderJsonError = (err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Send a valid JSON order.' });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Order request is too large.' });
    }
    next(err);
};

const menuJsonError = (err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Send a valid JSON object containing menu data.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Menu request is too large.' });
    next(err);
};

const notFound = (req, res) => {
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
};

const errorHandler = (err, req, res, next) => {
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
};

module.exports = { orderJsonError, menuJsonError, notFound, errorHandler };
