const { createDbConnection } = require('../src/config/db');

async function showSchema() {
  let connection;
  try {
    connection = await createDbConnection();
    const [tables] = await connection.query('SHOW TABLES');
    
    for (let row of tables) {
      const tableName = Object.values(row)[0];
      console.log(`\nTable: ${tableName}`);
      const [columns] = await connection.query(`DESCRIBE ${tableName}`);
      console.log(columns.map(c => `${c.Field} (${c.Type})`).join(', '));
    }
  } catch (error) {
    console.error(error);
  } finally {
    if (connection) await connection.end();
  }
}

showSchema();
