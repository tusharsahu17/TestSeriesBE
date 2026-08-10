const mysql = require('mysql2/promise');

const createDbConnection = async () => {
    return await mysql.createConnection(process.env.DATABASE_URL);
};

module.exports = { createDbConnection };
