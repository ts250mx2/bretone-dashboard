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
        VentaEn,
        COUNT(*) as TotalVentas
      FROM tblVentas
      GROUP BY VentaEn
    `;
    const [rows] = await connection.query(sqlQuery);
    console.log('Ventas por VentaEn:');
    console.table(rows);
  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
