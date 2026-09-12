import { describe, expect, it } from 'vitest';

import { renderSchema } from './render-schema.js';
import type { Dialect } from './render-schema.js';
import { TABLES } from './schema.js';

const DIALECTS: Dialect[] = ['postgres', 'mysql', 'sqlite'];

describe('the declared schema', () => {
    // The order is load-bearing: the data export inserts in it, and a target
    // that created `items` before `projects` would refuse the foreign key.
    it('declares every table after the ones it references', () => {
        const seen = new Set<string>();

        for (const table of TABLES) {
            for (const reference of table.references) {
                expect(seen.has(reference.table) || reference.table === table.name).toBe(true);
            }
            seen.add(table.name);
        }
    });

    it('gives every table a primary key made of its own columns', () => {
        for (const table of TABLES) {
            expect(table.primaryKey.length).toBeGreaterThan(0);
            const names = table.columns.map(column => column.name);
            for (const key of table.primaryKey) expect(names).toContain(key);
        }
    });

    it('points every reference at a column that exists', () => {
        for (const table of TABLES) {
            for (const reference of table.references) {
                const target = TABLES.find(other => other.name === reference.table);
                expect(target?.columns.map(column => column.name)).toContain(reference.target);
            }
        }
    });
});

describe('renderSchema', () => {
    it.each(DIALECTS)('creates every table, once, for %s', dialect => {
        const sql = renderSchema(dialect);

        expect(sql.match(/create table/gu)).toHaveLength(TABLES.length);
        for (const table of TABLES) expect(sql).toMatch(new RegExp(`create table [\`"]${table.name}[\`"]`, 'u'));
    });

    // A kind with no mapping would land in the output as the word `undefined`,
    // and the target would refuse the whole file with a syntax error rather
    // than tell us which column we forgot.
    it.each(DIALECTS)('leaves no unmapped type in the output for %s', dialect => {
        expect(renderSchema(dialect)).not.toMatch(/undefined/u);
    });

    it.each(DIALECTS)('declares every column of every table for %s', dialect => {
        const sql = renderSchema(dialect);

        for (const table of TABLES) {
            for (const column of table.columns) expect(sql).toContain(column.name);
        }
    });

    it('gives PostgreSQL a type of its own for each enumerated column', () => {
        const sql = renderSchema('postgres');

        expect(sql.indexOf('create type "item_status" as enum')).toBeLessThan(
            sql.indexOf('create table "items"'),
        );
        expect(sql).toContain(`create type "item_priority" as enum ('low', 'normal', 'high');`);
        // The name the database carries today, not one derived from the column.
        expect(sql).toContain(`"status" item_status not null default 'todo'`);
    });

    it('gives MySQL an inline enum, and the types it has instead of ours', () => {
        const sql = renderSchema('mysql');

        expect(sql).toContain(`\`status\` enum('todo', 'doing', 'done') not null default 'todo'`);
        expect(sql).toContain('`id` char(36) not null');
        expect(sql).toContain('`created_at` datetime(6) not null default current_timestamp(6)');
        expect(sql).toContain('`payload` json not null');
        expect(sql).not.toContain('create type');
    });

    // Measured against MySQL 8.4: a unique key on a wide varchar is refused
    // with "Specified key was too long; max key length is 3072 bytes", because
    // utf8mb4 counts four bytes per character. Only a keyed column is bounded,
    // and to the longest address RFC 5321 allows.
    it('bounds the keyed text column for MySQL, and leaves the others alone', () => {
        const sql = renderSchema('mysql');

        expect(sql).toContain('`email` varchar(320) not null');
        expect(sql).toContain('`name` text not null');
        expect(sql).toContain('`role` text not null');
    });

    // SQLite has neither an enumerated type nor an inline enum, so the values
    // move into a check: the same rows are refused, by the only means it has.
    it('gives SQLite a check where the other two have a type', () => {
        const sql = renderSchema('sqlite');

        expect(sql).toContain(
            `"status" text not null default 'todo' check ("status" in ('todo', 'doing', 'done'))`,
        );
        expect(sql).toContain('"id" text not null');
        expect(sql).toContain('"created_at" text not null default current_timestamp');
        expect(sql).not.toContain('create type');
    });

    // Found by the container round trip: our own import script leaves
    // priority, version and the dates to the schema, so a target without those
    // defaults refused the very rows we sent it -- `null value in column
    // "version" violates not-null constraint`.
    it.each(DIALECTS)('carries the defaults our own writes depend on for %s', dialect => {
        const sql = renderSchema(dialect);

        expect(sql).toMatch(/"?`?version`?"? (?:int|integer) not null default 1/u);
        expect(sql).toMatch(/default 'normal'/u);
        expect(sql).toMatch(/default (?:now\(\)|current_timestamp)/u);
    });

    // The identifier generator is a function of ours. A target supplies its
    // own identifiers, or receives them with the data, which is what our
    // exports do -- so exporting the default would only fail to apply.
    it.each(DIALECTS)('leaves the identifier generator behind for %s', dialect => {
        expect(renderSchema(dialect)).not.toContain('uuid_generate');
    });

    it.each(DIALECTS)('keeps one notification per event for %s', dialect => {
        expect(renderSchema(dialect)).toMatch(/unique \([`"]event_id[`"]\)/u);
    });

    it.each(DIALECTS)('carries every foreign key for %s', dialect => {
        const sql = renderSchema(dialect);
        const declared = TABLES.flatMap(table => table.references);

        expect(sql.match(/foreign key/gu)).toHaveLength(declared.length);
        expect(sql.match(/on delete cascade/gu)).toHaveLength(declared.length);
    });

    it('names the composite key of a membership in both its columns', () => {
        expect(renderSchema('mysql')).toContain('primary key (`project_id`, `user_id`)');
    });

    it('says in the file what it does not carry', () => {
        const sql = renderSchema('sqlite');

        expect(sql).toContain('row-level security');
        expect(sql).toContain('docs/data-migration.md');
    });
});
