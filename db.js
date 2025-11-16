import { createClient } from '@libsql/client';
import 'dotenv/config';

// Configuración del cliente Turso/LibSQL
const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

/**
 * Inicializa la base de datos, asegurando que la tabla 'users' exista
 * y que el esquema esté actualizado (incluyendo las columnas 'role', 'transactions_history' y 'balance').
 */
async function initializeDb() {
    try {
        // 1. Asegurar que la tabla exista (con la definición más reciente para instalaciones nuevas)
        await client.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                phone TEXT,
                password_hash TEXT NOT NULL,
                referral_code TEXT,
                role TEXT DEFAULT 'Usuario' NOT NULL,
                transactions_history TEXT DEFAULT '[]',
                balance REAL DEFAULT 0.00, -- NUEVA COLUMNA: Saldo inicial 0.00
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Database initialized: 'users' table ensured.");

        // 2. Migración de Esquema: Verificar y añadir columnas si faltan
        const columns = await client.execute("PRAGMA table_info(users)");
        
        // Verificar 'role'
        const roleColumnExists = columns.rows.some(col => col.name === 'role');
        if (!roleColumnExists) {
            console.log("Schema migration required: Adding 'role' column...");
            await client.execute(`
                ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'Usuario' NOT NULL;
            `);
            console.log("'role' column added successfully.");
        }

        // Verificar 'transactions_history'
        const historyColumnExists = columns.rows.some(col => col.name === 'transactions_history');
        if (!historyColumnExists) {
            console.log("Schema migration required: Adding 'transactions_history' column...");
            await client.execute(`
                ALTER TABLE users ADD COLUMN transactions_history TEXT DEFAULT '[]';
            `);
            console.log("'transactions_history' column added successfully.");
        }

        // Verificar 'balance' (NUEVO)
        const balanceColumnExists = columns.rows.some(col => col.name === 'balance');
        if (!balanceColumnExists) {
            console.log("Schema migration required: Adding 'balance' column...");
            await client.execute(`
                ALTER TABLE users ADD COLUMN balance REAL DEFAULT 0.00;
            `);
            console.log("'balance' column added successfully.");
        }

    } catch (error) {
        console.error("Error initializing database or running migration. Check your .env credentials and Turso connection:", error);
        // Exit if DB connection fails critically
        process.exit(1);
    }
}

export { client, initializeDb };
