const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function initDb(filename) {
    const db = await open({
        filename: filename || path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS connected_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            email TEXT NOT NULL,
            name TEXT,
            avatar TEXT,
            refresh_token TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id),
            UNIQUE(user_id, email)
        );
    `);

    return db;
}

module.exports = { initDb };
