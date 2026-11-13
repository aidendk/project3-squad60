// Shared server settings. Secrets are read only by the database/chat/auth modules.
const databaseQueryTimeout = 15000;
const requiredDbEnv = ['PSQL_USER', 'PSQL_HOST', 'PSQL_DATABASE', 'PSQL_PASSWORD', 'PSQL_PORT'];
const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
const sessionSecret = process.env.SESSION_SECRET || 'dev-only-quality-boba-session';
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
const googleCallbackUrl = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback';
const cashierAllowedEmails = (process.env.CASHIER_ALLOWED_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
const cashierAllowedDomain = (process.env.CASHIER_ALLOWED_DOMAIN || '').trim().toLowerCase();

module.exports = {
    databaseQueryTimeout,
    requiredDbEnv,
    isProduction,
    sessionSecret,
    googleClientId,
    googleClientSecret,
    googleCallbackUrl,
    cashierAllowedEmails,
    cashierAllowedDomain
};
