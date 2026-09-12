import { TABLES } from './schema.js';
import type { Column, Default, Enumeration, Table } from './schema.js';

// The three targets an exit can aim at. `postgres` is the faithful one: our
// migrations rebuild it and nothing is lost. The other two are reachable only
// because the schema is translated -- writing our rows back into the legacy
// three-column table would lose the project, the owner, the priority, the due
// date and the notifications (ADR-0017).
export type Dialect = 'postgres' | 'mysql' | 'sqlite';

// What each dialect has instead of what we use.
//
// uuid      MySQL has no uuid type; char(36) is what the legacy already used.
// timestamp MySQL's datetime(6) keeps the microseconds PostgreSQL stores, but
//           carries no zone: the export writes UTC and says so.
// json      SQLite has no json type; it holds the text and its json1
//           functions read it.
const TYPES: Record<Dialect, Record<Column['kind'], string>> = {
    postgres: {
        uuid: 'uuid',
        text: 'text',
        timestamp: 'timestamptz',
        date: 'date',
        json: 'jsonb',
        integer: 'integer',
    },
    mysql: {
        uuid: 'char(36)',
        text: 'text',
        // No zone, which PostgreSQL's timestamptz carries: the data export
        // writes UTC, and docs/data-migration.md says so.
        timestamp: 'datetime(6)',
        date: 'date',
        json: 'json',
        integer: 'int',
    },
    sqlite: {
        uuid: 'text',
        text: 'text',
        timestamp: 'text',
        date: 'text',
        json: 'text',
        integer: 'integer',
    },
};

// `now()` is PostgreSQL's spelling, `current_timestamp` the standard one.
// MySQL needs the precision spelled out, or it drops the microseconds our
// timestamps carry.
const NOW: Record<Dialect, string> = {
    postgres: 'now()',
    mysql: 'current_timestamp(6)',
    sqlite: 'current_timestamp',
};

const QUOTES: Record<Dialect, [string, string]> = {
    postgres: ['"', '"'],
    mysql: ['`', '`'],
    sqlite: ['"', '"'],
};

export function quoteName(name: string, dialect: Dialect): string {
    const [open, close] = QUOTES[dialect];
    return `${open}${name}${close}`;
}

function literal(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
}

// An enumerated column, three ways. PostgreSQL keeps the type it has today, so
// the same value is refused at the same place; MySQL takes an inline enum;
// SQLite a check, which is all it has.
function enumType(enumeration: Enumeration, dialect: Dialect): string {
    if (dialect === 'postgres') return enumeration.type;
    if (dialect === 'mysql') return `enum(${enumeration.values.map(literal).join(', ')})`;

    return 'text';
}

function isKeyed(table: Table, column: Column): boolean {
    return (
        table.primaryKey.includes(column.name) ||
        table.unique.some(names => names.includes(column.name))
    );
}

// MySQL cannot key a text column without a prefix length, and a key is capped
// at 3072 bytes -- 768 utf8mb4 characters. A keyed text column therefore
// becomes a varchar, sized to the longest address RFC 5321 allows (64 + 1 +
// 255). `users.email` is the only one we have; a future one longer than that
// would be refused by MySQL at insert time, loudly, not truncated.
function columnType(table: Table, column: Column, dialect: Dialect): string {
    if (column.enumeration !== undefined) return enumType(column.enumeration, dialect);
    if (dialect === 'mysql' && column.kind === 'text' && isKeyed(table, column)) {
        return 'varchar(320)';
    }

    return TYPES[dialect][column.kind];
}

function defaultFor(value: Default, dialect: Dialect): string {
    if (value === 'now') return ` default ${NOW[dialect]}`;

    return ` default ${typeof value.literal === 'number' ? value.literal : literal(value.literal)}`;
}

function columnLine(table: Table, column: Column, dialect: Dialect): string {
    const { enumeration } = column;
    const type = columnType(table, column, dialect);
    const nullable = column.nullable ? '' : ' not null';
    const fallback = column.default === undefined ? '' : defaultFor(column.default, dialect);
    const check =
        enumeration !== undefined && dialect === 'sqlite'
            ? ` check (${quoteName(column.name, dialect)} in (${enumeration.values
                  .map(literal)
                  .join(', ')}))`
            : '';

    return `  ${quoteName(column.name, dialect)} ${type}${nullable}${fallback}${check}`;
}

function keyLines(table: Table, dialect: Dialect): string[] {
    const columns = (names: readonly string[]): string =>
        names.map(name => quoteName(name, dialect)).join(', ');

    return [
        `  primary key (${columns(table.primaryKey)})`,
        ...table.unique.map(names => `  unique (${columns(names)})`),
        ...table.references.map(
            reference =>
                `  foreign key (${quoteName(reference.column, dialect)}) references ` +
                `${quoteName(reference.table, dialect)} (${quoteName(reference.target, dialect)}) ` +
                'on delete cascade',
        ),
    ];
}

// The enumerated types PostgreSQL needs before the tables that use them. The
// other two dialects carry the values at the column, so they need none.
function enumTypes(dialect: Dialect): string[] {
    if (dialect !== 'postgres') return [];

    return TABLES.flatMap(table =>
        table.columns.flatMap(column =>
            column.enumeration === undefined
                ? []
                : [
                      `create type ${quoteName(column.enumeration.type, dialect)} as enum (` +
                          `${column.enumeration.values.map(literal).join(', ')});`,
                  ],
        ),
    );
}

function createTable(table: Table, dialect: Dialect): string {
    const lines = [
        ...table.columns.map(column => columnLine(table, column, dialect)),
        ...keyLines(table, dialect),
    ];

    return `create table ${quoteName(table.name, dialect)} (\n${lines.join(',\n')}\n);`;
}

// The tables a target database needs in order to hold our data.
//
// In the declared order, which is the order references allow: every foreign key
// points at a table already created. A target that created them alphabetically
// would refuse `items` before `projects` exists.
export function renderSchema(dialect: Dialect): string {
    return [
        `-- Legacy 22 schema, rendered for ${dialect}.`,
        '--',
        '-- Value checks, row-level security policies, triggers, the identifier',
        '-- generators and the auth schema are not here: docs/data-migration.md',
        '-- says why, and what that leaves to do on the target.',
        '',
        ...enumTypes(dialect),
        ...(dialect === 'postgres' ? [''] : []),
        ...TABLES.map(table => createTable(table, dialect)),
        '',
    ].join('\n');
}
