// mysql2's exports are statically analysable, so named imports are safe here,
// unlike sqlite3 below the same folder.
import { createPool } from 'mysql2';
import type { Pool } from 'mysql2';
import waitPort from 'wait-port';
import fs from 'node:fs';

import { toItem } from './types.js';
import type { Item, ItemUpdate, NewItem, Persistence } from './types.js';

const {
    MYSQL_HOST: HOST,
    MYSQL_HOST_FILE: HOST_FILE,
    MYSQL_USER: USER,
    MYSQL_USER_FILE: USER_FILE,
    MYSQL_PASSWORD: PASSWORD,
    MYSQL_PASSWORD_FILE: PASSWORD_FILE,
    MYSQL_DB: DB,
    MYSQL_DB_FILE: DB_FILE,
} = process.env;

let pool: Pool;

// The *_FILE variants are Docker secrets: the value is a path to read, not the
// value itself. readFileSync returns a Buffer, which mysql2 accepts as-is, so
// the original behaviour is preserved by converting to string only here.
function readSecret(file: string | undefined, value: string | undefined): string | undefined {
    return file ? fs.readFileSync(file, 'utf8') : value;
}

async function init(): Promise<void> {
    const host = readSecret(HOST_FILE, HOST);
    const user = readSecret(USER_FILE, USER);
    const password = readSecret(PASSWORD_FILE, PASSWORD);
    const database = readSecret(DB_FILE, DB);

    // An absent variable is spread away rather than passed as an explicit
    // `undefined`: both read back as undefined, but only the first form is
    // expressible under exactOptionalPropertyTypes.
    await waitPort({
        ...(host === undefined ? {} : { host }),
        port: 3306,
        timeout: 10000,
        waitForDns: true,
    });

    pool = createPool({
        connectionLimit: 5,
        ...(host === undefined ? {} : { host }),
        ...(user === undefined ? {} : { user }),
        ...(password === undefined ? {} : { password }),
        ...(database === undefined ? {} : { database }),
        charset: 'utf8mb4',
    });

    return new Promise((acc, rej) => {
        pool.query(
            'CREATE TABLE IF NOT EXISTS todo_items (id varchar(36), name varchar(255), completed boolean) DEFAULT CHARSET utf8mb4',
            err => {
                if (err) return rej(err);

                console.log(`Connected to mysql db at host ${HOST}`);
                acc();
            },
        );
    });
}

async function teardown(): Promise<void> {
    return new Promise((acc, rej) => {
        pool.end(err => {
            if (err) rej(err);
            else acc();
        });
    });
}

async function getItems(): Promise<Item[]> {
    return new Promise((acc, rej) => {
        pool.query('SELECT * FROM todo_items', (err, rows) => {
            if (err) return rej(err);
            acc((rows as unknown[]).map(toItem));
        });
    });
}

async function getItem(id: string): Promise<Item | undefined> {
    return new Promise((acc, rej) => {
        pool.query('SELECT * FROM todo_items WHERE id=?', [id], (err, rows) => {
            if (err) return rej(err);
            acc((rows as unknown[]).map(toItem)[0]);
        });
    });
}

async function storeItem(item: NewItem): Promise<void> {
    return new Promise((acc, rej) => {
        pool.query(
            'INSERT INTO todo_items (id, name, completed) VALUES (?, ?, ?)',
            [item.id, item.name, item.completed ? 1 : 0],
            err => {
                if (err) return rej(err);
                acc();
            },
        );
    });
}

async function updateItem(id: string, item: ItemUpdate): Promise<void> {
    return new Promise((acc, rej) => {
        pool.query(
            'UPDATE todo_items SET name=?, completed=? WHERE id=?',
            [item.name, item.completed ? 1 : 0, id],
            err => {
                if (err) return rej(err);
                acc();
            },
        );
    });
}

async function removeItem(id: string): Promise<void> {
    return new Promise((acc, rej) => {
        pool.query('DELETE FROM todo_items WHERE id = ?', [id], err => {
            if (err) return rej(err);
            acc();
        });
    });
}

const mysqlPersistence: Persistence = {
    init,
    teardown,
    getItems,
    getItem,
    storeItem,
    updateItem,
    removeItem,
};

export default mysqlPersistence;
