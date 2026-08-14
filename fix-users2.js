require('dotenv').config();
const { createDbConnection } = require('./src/config/db');

async function fixUsers() {
  const c = await createDbConnection();
  try {
    await c.query(`
      ALTER TABLE users 
      ADD COLUMN status VARCHAR(20) DEFAULT 'active', 
      ADD COLUMN subscription_status VARCHAR(20) DEFAULT 'free', 
      ADD COLUMN name VARCHAR(255), 
      ADD COLUMN email VARCHAR(255), 
      ADD COLUMN phone VARCHAR(20)
    `);
    console.log('Columns added successfully to users table in db: ' + process.env.DB_NAME);
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('Columns already exist.');
    } else {
      console.error(e);
    }
  } finally {
    await c.end();
  }
}
fixUsers();
