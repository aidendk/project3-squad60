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
    isProduction
} = require('./config');

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function isAllowedCashier(email) {
    const normalized = normalizeEmail(email);
    return Boolean(normalized && cashierAllowedEmails.includes(normalized));
}

function googleAuthConfigured() {
    return Boolean(googleClientId && googleClientSecret);
}

function configureAuth(app) {
    const productionSecret = process.env.SESSION_SECRET?.trim();

    if (isProduction && (!productionSecret || productionSecret.length < 32)) {
        throw new Error('Set SESSION_SECRET to a random secret of at least 32 characters.');
    }

    if (cashierAllowedEmails.length === 0) {
        console.warn('CASHIER_ALLOWED_EMAILS is empty. Cashier access will be denied.');
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
            if (!isAllowedCashier(email)) {
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

function requireCashier(req, res, next) {
    if (req.isAuthenticated?.() && isAllowedCashier(req.user?.email)) {
        return next();
    }

    const wantsJson = req.originalUrl.startsWith('/api/') || String(req.headers.accept || '').includes('application/json');
    if (wantsJson) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    return res.redirect('/login?next=/cashier');
}

module.exports = {
    configureAuth,
    requireCashier,
    googleAuthConfigured,
    isAllowedCashier
};
