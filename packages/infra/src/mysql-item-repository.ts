// mysql2's exports are statically analysable, so named imports are safe here,
// unlike sqlite3 in the sibling adapter.
import { createPool } from 'mysql2';
import type { Pool } from 'mysql2';
import waitPort from 'wait-port';

import type { Item } from '@legacy/core-items';

import { toItem } from './row.js';
import type { ItemStore } from './item-store.js';

export interface MysqlSettings {
    host: string | undefined;
    user: string | undefined;
    password: string | undefined;
    database: string | undefined;
}

export function createMysqlItemStore(settings: MysqlSettings): ItemStore {
    const { host, user, password, database } = settings;
    let pool: Pool;

    async function connect(): Promise<void> {
        // An absent setting is spread away rather than passed as an explicit
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
                    acc();
                },
            );
        });
    }

    async function disconnect(): Promise<void> {
        return new Promise((acc, rej) => {
            pool.end(err => {
                if (err) rej(err);
                else acc();
            });
        });
    }

    async function findAll(): Promise<Item[]> {
        return new Promise((acc, rej) => {
            pool.query('SELECT * FROM todo_items', (err, rows) => {
                if (err) return rej(err);
                acc((rows as unknown[]).map(toItem));
            });
        });
    }

    async function findById(id: string): Promise<Item | undefined> {
        return new Promise((acc, rej) => {
            pool.query('SELECT * FROM todo_items WHERE id=?', [id], (err, rows) => {
                if (err) return rej(err);
                acc((rows as unknown[]).map(toItem)[0]);
            });
        });
    }

    async function save(item: Item): Promise<void> {
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

    async function update(item: Item): Promise<void> {
        return new Promise((acc, rej) => {
            pool.query(
                'UPDATE todo_items SET name=?, completed=? WHERE id=?',
                [item.name, item.completed ? 1 : 0, item.id],
                err => {
                    if (err) return rej(err);
                    acc();
                },
            );
        });
    }

    async function remove(id: string): Promise<void> {
        return new Promise((acc, rej) => {
            pool.query('DELETE FROM todo_items WHERE id = ?', [id], err => {
                if (err) return rej(err);
                acc();
            });
        });
    }

    return { connect, disconnect, findAll, findById, save, update, remove };
}
