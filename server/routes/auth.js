const express = require('express');
const passport = require('passport');
const { googleAuthConfigured } = require('../auth');

const loginErrors = {
    unauthorized: 'This Google account is not authorized for the register.',
    denied: 'Google sign-in was cancelled or failed.',
    config: 'Cashier login is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
    no_email: 'Google did not provide an email address for this account.'
};

function createAuthRouter() {
    const router = express.Router();

    router.get('/login', (req, res) => {
        if (req.isAuthenticated && req.isAuthenticated()) {
            return res.redirect('/cashier');
        }

        const errorKey = typeof req.query.error === 'string' ? req.query.error : '';
        res.render('login', {
            error: loginErrors[errorKey] || null,
            googleConfigured: googleAuthConfigured()
        });
    });

    router.get('/auth/google', (req, res, next) => {
        if (!googleAuthConfigured()) {
            return res.redirect('/login?error=config');
        }

        passport.authenticate('google', {
            scope: ['profile', 'email'],
            prompt: 'select_account'
        })(req, res, next);
    });

    router.get('/auth/google/callback', (req, res, next) => {
        if (!googleAuthConfigured()) {
            return res.redirect('/login?error=config');
        }

        passport.authenticate('google', (err, user, info) => {
            if (err) {
                return next(err);
            }
            if (!user) {
                const reason = info?.message === 'unauthorized' || info?.message === 'no_email'
                    ? info.message
                    : 'denied';
                return res.redirect(`/login?error=${reason}`);
            }

            req.logIn(user, (loginErr) => {
                if (loginErr) {
                    return next(loginErr);
                }
                return res.redirect('/cashier');
            });
        })(req, res, next);
    });

    router.get('/logout', (req, res, next) => {
        const finish = () => {
            res.clearCookie('qb.sid');
            res.redirect('/login');
        };

        if (typeof req.logout === 'function') {
            req.logout((err) => {
                if (err) {
                    return next(err);
                }
                if (req.session) {
                    return req.session.destroy(finish);
                }
                return finish();
            });
            return;
        }

        finish();
    });

    return router;
}

module.exports = { createAuthRouter };
