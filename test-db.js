const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const envPath = path.join(__dirname, '.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val) {
    env[key.trim()] = val.join('=').trim();
  }
});

async function main() {
  const connection = await mysql.createConnection({
    host: env.DB_HOST,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    port: parseInt(env.DB_PORT || '3306'),
  });

  try {
    const sqlQuery = `
      SELECT 
        C.IdCancelacion,
        COALESCE(SUM(DC.Cantidad * DC.Precio), 0) AS MontoCancelado
      FROM tblCancelaciones C
      LEFT JOIN tblDetalleCancelaciones DC ON C.IdCancelacion = DC.IdCancelacion
      WHERE C.IdCancelacion IN (2682, 2681, 2680, 2679)
      GROUP BY C.IdCancelacion
    `;
    const [rows] = await connection.query(sqlQuery);
    console.log('Test Cancelaciones SUM:');
    console.table(rows);
  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
