import { quoteName } from './render-schema.js';
import type { Dialect } from './render-schema.js';
import type { Column, Table } from './schema.js';
import type { Cell, Snapshot } from './postgres-dump.js';

// Writing our rows for a target engine.
//
// The rows come from our own export, so their shape is known and nothing here
// guesses. What does need care is the one type the other two engines do not
// have: PostgreSQL writes a timestamp with its offset, and neither
// `datetime(6)` nor SQLite text carries one.

// `2026-09-12 13:15:15.009+00`, as pg_dump writes it. The offset is required:
// a value without one would mean whatever the target decides, and that is the
// kind of silence this tool exists to avoid.
const TIMESTAMP =
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?)(?:([+-]\d{2})(?::?(\d{2}))?|Z)$/u;

export class ExportError extends Error {
    constructor(reason: string) {
        super(reason);
        this.name = new.target.name;
    }
}

// Dropped, not converted: the export must be produced in UTC, and refusing
// another offset beats shifting every date by a guess. `supabase db dump`
// writes UTC, so this refusal is a guard and not a chore.
function withoutZone(value: string): string {
    const parts = TIMESTAMP.exec(value);
    if (parts === null) throw new ExportError(`\`${value}\` is not a timestamp this tool reads`);

    const [, date, time, hours, minutes] = parts;
    if (hours !== undefined && (Number(hours) !== 0 || Number(minutes ?? '0') !== 0)) {
        throw new ExportError(
            `\`${value}\` is not in UTC. Produce the export with the server in UTC: ` +
                'every target here holds a timestamp without a zone.',
        );
    }

    return `${date} ${time}`;
}

// A doubled quote closes nothing, in all three. A backslash is where they
// part: MySQL reads it as an escape inside a literal, so a value holding two
// of them would arrive holding one -- measured, not supposed. PostgreSQL with
// standard_conforming_strings on and SQLite both keep it as itself.
function literal(value: string, dialect: Dialect): string {
    const escaped =
        dialect === 'mysql' ? value.replaceAll('\\', '\\\\') : value;

    return `'${escaped.replaceAll("'", "''")}'`;
}

function cellFor(cell: Cell, column: Column, dialect: Dialect): string {
    if (cell === null) return 'null';
    if (typeof cell === 'boolean') return cell ? 'true' : 'false';
    if (column.kind === 'integer') return cell;
    if (column.kind === 'timestamp' && dialect !== 'postgres') {
        return literal(withoutZone(cell), dialect);
    }

    return literal(cell, dialect);
}

function insertFor(
    table: Table,
    rows: readonly ReadonlyMap<string, Cell>[],
    dialect: Dialect,
): string[] {
    if (rows.length === 0) return [`-- ${table.name}: the export carried no row.`];

    const columns = table.columns.map(column => quoteName(column.name, dialect)).join(', ');
    const values = rows.map(
        row =>
            `  (${table.columns
                .map(column => cellFor(row.get(column.name) ?? null, column, dialect))
                .join(', ')})`,
    );

    return [
        `insert into ${quoteName(table.name, dialect)} (${columns})`,
        'values',
        `${values.join(',\n')};`,
    ];
}

// Every row, in the order references allow, inside one transaction.
//
// One transaction and not one per table: a target left half-filled would be
// worse than one left empty, because nothing would say which half.
export function renderData(snapshot: Snapshot, dialect: Dialect): string {
    const body = snapshot.tables.flatMap(({ table, rows }) => [
        ...insertFor(table, rows, dialect),
        '',
    ]);

    const header = [
        `-- Legacy 22 data, rendered for ${dialect}.`,
        '--',
        dialect === 'postgres'
            ? '-- Timestamps keep the offset the export carried.'
            : '-- Timestamps are UTC without a zone: neither target carries one.',
        '--',
        '-- Accounts and passwords are not here. They belong to GoTrue, in the',
        '-- auth schema, which no data export of ours reaches.',
        '',
    ];

    // SQLite has no `start transaction`, MySQL has both spellings, PostgreSQL
    // takes `begin`: the one word all three read.
    return [...header, 'begin;', '', ...body, 'commit;', ''].join('\n');
}
