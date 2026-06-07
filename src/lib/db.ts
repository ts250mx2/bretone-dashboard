import mysql from 'mysql2/promise';

const poolConfig = {
    host: process.env.DB_SERVER || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'BDBretoneContry',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
};

declare global {
    var mysqlPool: mysql.Pool | undefined;
}

const pool = globalThis.mysqlPool || mysql.createPool(poolConfig);

if (process.env.NODE_ENV !== 'production') {
    globalThis.mysqlPool = pool;
}

export async function getPool() {
    return pool;
}

export async function query(queryString: string, params: any[] = []) {
    try {
        const [rows] = await pool.execute(queryString, params);
        return rows as any[];
    } catch (error) {
        console.error('\n========== DATABASE ERROR ==========');
        console.error('Failed SQL Query:', queryString.trim().replace(/\s+/g, ' '));
        if (params && params.length > 0) {
            console.error('Parameters:', params);
        }
        console.error('Error Details:', error);
        console.error('====================================\n');
        throw error;
    }
}
