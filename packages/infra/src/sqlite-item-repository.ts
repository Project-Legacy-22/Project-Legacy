// sqlite3 reassigns module.exports wholesale, so Node's ESM named-export
// detection cannot see `Database`. A default import is the only form that works
// at runtime here; `import * as` and named imports throw on startup.
import sqlite3 from 'sqlite3';
import fs from 'node:fs';
import path from 'node:path';

import type { Item } from '@legacy/core-items';

import { toItem } from './row.js';
import type { ItemStore } from './item-store.js';

// The database location is passed in, not read from the environment: this
// module has no business knowing how the process was configured.
export function createSqliteItemStore(location: string): ItemStore {
    const verbose = sqlite3.verbose();
    let db: sqlite3.Database;

    async function connect(): Promise<void> {
        const dirName = path.dirname(location);
        if (!fs.existsSync(dirName)) {
            fs.mkdirSync(dirName, { recursive: true });
        }

        return new Promise((acc, rej) => {
            db = new verbose.Database(location, err => {
                if (err) return rej(err);

                db.run(
                    'CREATE TABLE IF NOT EXISTS todo_items (id varchar(36), name varchar(255), completed boolean)',
                    tableErr => {
                        if (tableErr) return rej(tableErr);
                        acc();
                    },
                );
            });
        });
    }

    async function disconnect(): Promise<void> {
        return new Promise((acc, rej) => {
            db.close(err => {
                if (err) rej(err);
                else acc();
            });
        });
    }

    async function findAll(): Promise<Item[]> {
        return new Promise((acc, rej) => {
            db.all('SELECT * FROM todo_items', (err, rows: unknown[]) => {
                if (err) return rej(err);
                acc(rows.map(toItem));
            });
        });
    }

    async function findById(id: string): Promise<Item | undefined> {
        return new Promise((acc, rej) => {
            db.all('SELECT * FROM todo_items WHERE id=?', [id], (err, rows: unknown[]) => {
                if (err) return rej(err);
                acc(rows.map(toItem)[0]);
            });
        });
    }

    async function save(item: Item): Promise<void> {
        return new Promise((acc, rej) => {
            db.run(
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
            db.run(
                'UPDATE todo_items SET name=?, completed=? WHERE id = ?',
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
            db.run('DELETE FROM todo_items WHERE id = ?', [id], err => {
                if (err) return rej(err);
                acc();
            });
        });
    }

    return { connect, disconnect, findAll, findById, save, update, remove };
}
