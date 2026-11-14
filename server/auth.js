const passport = require('passport');
const session = require('express-session');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const {
    sessionSecret,
    googleClientId,
    googleClientSecret,
    googleCallbackUrl,
    cashierAllowedEmails,
    cashierAllowedDomain,
    isProduction,
    managerAllowedEmails
} = require('./config');

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function isAllowedCashier(email) {
    return cashierAllowedEmails.includes(normalizeEmail(email)) || isAllowedManager(email);
}

function isAllowedManager(email) {
    return managerAllowedEmails.includes(normalizeEmail(email));
}

function isAllowedKitchen(email) {
    return isAllowedCashier(email) || isAllowedManager(email);
}

const staffAccess = new Map([
    ['/cashier', isAllowedCashier],
    ['/manager', isAllowedManager],
    ['/kitchen', isAllowedKitchen]
]);

function canAccessStaffPage(user, page) {
    return staffAccess.get(page)?.(user?.email) === true;
}

function staffLandingPage(user, requestedPage) {
    if (staffAccess.has(requestedPage)) {
        return canAccessStaffPage(user, requestedPage) ? requestedPage : null;
    }

    if (isAllowedManager(user?.email)) return '/manager';
    if (isAllowedCashier(user?.email)) return '/cashier';
    return null;
}
function googleAuthConfigured() {
    return Boolean(googleClientId && googleClientSecret);
}

function configureAuth(app) {
    const productionSecret = process.env.SESSION_SECRET?.trim();

    if (isProduction && (process.env.SESSION_SECRET?.trim().length || 0) < 32) {
        throw new Error('Set SESSION_SECRET to a random secret of at least 32 characters.');
    }

    if (isProduction) {
        app.set('trust proxy', 1);
    }

    app.use(session({
        name: 'qb.sid',
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: isProduction,
            maxAge: 12 * 60 * 60 * 1000
        }
    }));

    passport.serializeUser((user, done) => done(null, user));
    passport.deserializeUser((user, done) => done(null, user));

    if (googleAuthConfigured()) {
        passport.use(new GoogleStrategy({
            clientID: googleClientId,
            clientSecret: googleClientSecret,
            callbackURL: googleCallbackUrl,
            state:true
        }, (accessToken, refreshToken, profile, done) => {
            const email = normalizeEmail(profile.emails?.[0]?.value);
            const name = profile.displayName || email;
            if (!email) {
                return done(null, false, { message: 'no_email' });
            }
            if (!isAllowedKitchen(email) || profile.emails?.[0]?.verified !== true) {
                return done(null, false, { message: 'unauthorized' });
            }
            return done(null, { googleId: profile.id, email, name });
        }));
    } else {
        console.warn('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing. Cashier Google login is disabled.');
    }

    app.use(passport.initialize());
    app.use(passport.session());
}

function requireStaffPage(page) {
    return (req, res, next) => {
        res.set('Cache-Control', 'no-store');
        const signedIn = req.isAuthenticated?.();
        if (signedIn && canAccessStaffPage(req.user, page)) return next();

        const wantsJson = req.originalUrl.startsWith('/api/') ||
            String(req.headers.accept || '').includes('application/json');

        if (wantsJson) {
            return signedIn
                ? res.status(403).json({ error: 'Access denied' })
                : res.status(401).json({ error: 'Authentication required' });
        }

        if (signedIn) {
            return res.status(403).send('This account does not have access to this staff page.');
        }

        return res.redirect('/login?next=' + page);
    };
}

module.exports = {
    configureAuth,
    requireCashier: requireStaffPage('/cashier'),
    requireManager: requireStaffPage('/manager'),
    requireKitchen: requireStaffPage('/kitchen'),
    googleAuthConfigured,
    isAllowedCashier,
    staffAccess,
    staffLandingPage
    
};