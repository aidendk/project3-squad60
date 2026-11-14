const express = require('express');
const passport = require('passport');
const { googleAuthConfigured, staffAccess, staffLandingPage } = require('../auth');

const loginErrors = {
    unauthorized: 'This Google account is not authorized for staff access.',
    denied: 'Google sign-in was cancelled or failed.',
    config: 'Cashier login is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
    no_email: 'Google did not provide an email address for this account.',
    manager_required: 'This Google account does not have manager access. Choose an approved manager account.',
};

function createAuthRouter() {
    const router = express.Router();

    router.get('/login', (req, res) => {
        const requestedPage = req.query.next;
        if (staffAccess.has(requestedPage)) {
            req.session.staffDestination = requestedPage;
        }

        if (req.isAuthenticated?.()) {
            const destination = staffLandingPage(req.user, requestedPage);
            if (destination) return res.redirect(destination);
        }

        const errorKey = typeof req.query.error === 'string' ? req.query.error : '';
        const signInHeading = req.session.staffDestination === '/manager'
            ? 'Manager sign in'
            : 'Cashier sign in';

        res.render('login', {
            signInHeading,
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

            const requestedPage = req.session.staffDestination;
            const destination = staffLandingPage(user, requestedPage);

            if (!destination) {
                const reason = requestedPage === '/manager'
                    ? 'manager_required'
                    : 'unauthorized';

                return res.redirect(`/login?error=${reason}`);
            }

            req.logIn(user, (loginErr) => {
                if (loginErr) {
                    return next(loginErr);
                }

                return res.redirect(destination);
            });
        })(req, res, next);
    });

    router.get('/logout', (req, res, next) => {
        const loginUrl = req.query.next === '/manager'
            ? '/login?next=/manager'
            : '/login?next=/cashier';

        const finish = (err) => {
            if (err) return next(err);

            res.clearCookie('qb.sid');
            return res.redirect(loginUrl);
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
