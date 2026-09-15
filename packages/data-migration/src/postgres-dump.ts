import { TABLES, tableNamed } from './schema.js';
import type { Table } from './schema.js';
import { SqlTextError, tokenise } from './sql-tokens.js';
import {
    expect,
    insertedName,
    peek,
    readCell,
    reader,
    skipInsertInto,
    skipStatement,
    take,
} from './statement-reader.js';
import type { Cell, Reader } from './statement-reader.js';

// Reading our own data, out of what `supabase db dump --data-only` writes.
//
// Why a dump rather than a connection: this package opens none, and the dump
// is produced by the tool that already knows how to reach the database. It
// writes `insert` statements unless asked for `copy` (`--use-copy`), which is
// exactly what the tokeniser of #288 reads -- so both directions of the
// migration share one reader.
//
// What is not in it, because `-s public` does not carry it: the `auth` schema,
// so no account and no password. The ADR-0017 calls that the cost of leaving,
// and docs/data-migration.md says what it leaves to do on the target.

export type { Cell } from './statement-reader.js';

export interface Snapshot {
    // Every table of the schema, in the order rows must be inserted, each with
    // the rows the export carried -- an empty list included, so the difference
    // between "no row" and "table absent from the export" stays visible.
    tables: readonly { table: Table; rows: readonly ReadonlyMap<string, Cell>[] }[];
}

function readColumnList(input: Reader, table: Table): readonly string[] {
    if (peek(input)?.value !== '(') return table.columns.map(column => column.name);

    take(input);
    const names: string[] = [];

    for (;;) {
        const token = take(input);

        if (token.value === ')') break;
        if (token.value === ',') continue;

        const name = token.value.toLowerCase();
        if (!table.columns.some(column => column.name === name)) {
            throw new SqlTextError(
                token.line,
                `\`${name}\` is not a column of ${table.name}. The schema described in ` +
                    'schema.ts no longer matches the database that produced this export.',
            );
        }

        names.push(name);
    }

    return names;
}

function readRow(input: Reader, columns: readonly string[]): ReadonlyMap<string, Cell> {
    expect(input, '(');
    const row = new Map<string, Cell>();

    for (const column of columns) {
        row.set(column, readCell(input));
        if (peek(input)?.value === ',') take(input);
    }

    expect(input, ')');
    return row;
}

function readInsert(input: Reader, table: Table, into: Map<string, ReadonlyMap<string, Cell>[]>): void {
    skipInsertInto(input);

    const columns = readColumnList(input, table);
    expect(input, 'values');

    const rows = into.get(table.name) ?? [];

    for (;;) {
        rows.push(readRow(input, columns));

        if (peek(input)?.value !== ',') break;
        take(input);
    }

    into.set(table.name, rows);
    skipStatement(input);
}

// Only `public`, and only the tables the model describes. The `auth` schema
// has a `users` table of its own, and reading it as ours would mix two
// different sets of columns under one name.
function targetedTable(parts: readonly string[] | undefined): Table | undefined {
    if (parts === undefined) return undefined;

    const schema = parts.length > 1 ? parts[parts.length - 2] : 'public';
    if (schema !== 'public') return undefined;

    return tableNamed(parts[parts.length - 1] ?? '');
}

// Our rows, as the export carries them.
//
// Statements about tables the schema does not describe are skipped: a dump of
// `public` also carries whatever a migration added and this model does not
// know, and that gap is what the guard against information_schema catches.
export function readPostgresDump(dump: string): Snapshot {
    const input = reader(tokenise(dump, 'postgres'));
    const rows = new Map<string, ReadonlyMap<string, Cell>[]>();

    while (input.at < input.tokens.length) {
        const table = targetedTable(insertedName(input));

        if (table === undefined) skipStatement(input);
        else readInsert(input, table, rows);
    }

    return { tables: TABLES.map(table => ({ table, rows: rows.get(table.name) ?? [] })) };
}
