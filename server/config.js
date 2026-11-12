// Shared server settings. Secrets are read only by the database/chat modules.
const databaseQueryTimeout = 15000;
const requiredDbEnv = ['PSQL_USER', 'PSQL_HOST', 'PSQL_DATABASE', 'PSQL_PASSWORD', 'PSQL_PORT'];
module.exports = { databaseQueryTimeout, requiredDbEnv };
