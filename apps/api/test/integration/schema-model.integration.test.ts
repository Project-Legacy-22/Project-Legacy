import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { TABLES } from '../../../../packages/data-migration/src/schema.js';
import type { Column } from '../../../../packages/data-migration/src/schema.js';

// The guard that keeps packages/data-migration/src/schema.ts honest.
//
// That file is a copy of our schema, and the authority is supabase/migrations.
// A column added by a migration could stay out of every export without
// anything saying so -- the exports would keep working, quieter. This test is
// the shared line that makes the drift visible, the same role
// test/sql-function-owners.test.ts plays for SQL functions.
//
// It reads information_schema through the container the local stack runs, so
// it needs Docker and nothing else: no psql on the machine, no connection
// string to keep in step with the CLI.

// What information_schema calls each of our kinds. `udt_name` rather than
// `data_type`, because the latter says `USER-DEFINED` for an enumerated column
// and would compare nothing.
const UDT: Record<Column['kind'], string> = {
    uuid: 'uuid',
    text: 'text',
    timestamp: 'timestamptz',
    date: 'date',
    json: 'jsonb',
    integer: 'int4',
};

interface Observed {
    table: string;
    column: string;
    udt: string;
    nullable: boolean;
    hasDefault: boolean;
}

function container(): string {
    const found = execFileSync(
        'docker',
        ['ps', '--filter', 'name=supabase_db', '--format', '{{.Names}}'],
        { encoding: 'utf8' },
    ).trim();

    if (found === '') {
        throw new Error('The local Supabase stack is not up: run `npm run db:start` first.');
    }

    return found.split('\n')[0] ?? '';
}

function observed(): Observed[] {
    const query = `select table_name, column_name, udt_name, is_nullable,
            case when column_default is null then 'no' else 'yes' end
        from information_schema.columns
        where table_schema = 'public'
        order by table_name, ordinal_position`;

    const output = execFileSync(
        'docker',
        ['exec', container(), 'psql', '-U', 'postgres', '-At', '-F', '|', '-c', query],
        { encoding: 'utf8' },
    );

    return output
        .trim()
        .split('\n')
        .map(line => line.split('|'))
        .map(([table, column, udt, nullable, hasDefault]) => ({
            table: table ?? '',
            column: column ?? '',
            udt: udt ?? '',
            nullable: nullable === 'YES',
            hasDefault: hasDefault === 'yes',
        }));
}

describe('the schema the migration tools describe', () => {
    it('names the same tables the database carries', () => {
        const inDatabase = [...new Set(observed().map(row => row.table))].sort();

        expect(inDatabase).toEqual(TABLES.map(table => table.name).sort());
    });

    // Order included: the data export writes a column list, but the reader
    // falls back on the declared order when a dump carries none, so an order
    // that drifts would put values in the wrong columns.
    it('names the same columns, in the same order, for every table', () => {
        const rows = observed();

        for (const table of TABLES) {
            const columns = rows.filter(row => row.table === table.name).map(row => row.column);

            expect(columns, `columns of ${table.name}`).toEqual(
                table.columns.map(column => column.name),
            );
        }
    });

    it('gives every column the same type and the same nullability', () => {
        const rows = observed();

        for (const table of TABLES) {
            for (const column of table.columns) {
                const row = rows.find(one => one.table === table.name && one.column === column.name);
                const expected =
                    column.enumeration === undefined ? UDT[column.kind] : column.enumeration.type;

                expect(row?.udt, `${table.name}.${column.name} type`).toBe(expected);
                expect(row?.nullable, `${table.name}.${column.name} nullability`).toBe(
                    column.nullable,
                );
            }
        }
    });

    // Not the value, which only PostgreSQL spells its own way, but its
    // presence. A default that disappeared from the model made a rendered
    // target refuse the very rows our import script sends it, and the
    // container round trip is where that showed up.
    it('agrees on which columns carry a default, apart from the identifiers', () => {
        const rows = observed();

        for (const table of TABLES) {
            for (const column of table.columns) {
                // The identifier generator is a function of ours, deliberately
                // left out: a target receives identifiers with the data.
                if (table.primaryKey.includes(column.name)) continue;

                const row = rows.find(one => one.table === table.name && one.column === column.name);

                expect(row?.hasDefault, `${table.name}.${column.name} default`).toBe(
                    column.default !== undefined,
                );
            }
        }
    });
});
