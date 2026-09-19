const { createDbConnection } = require('./src/config/db');

async function test() {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query('DESCRIBE exams');
    console.log("Exams table schema:");
    console.table(rows);
  } catch(e) {
    console.error(e);
  } finally {
    if (connection) await connection.end();
  }
}
test();
