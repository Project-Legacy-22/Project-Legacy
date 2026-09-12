import { SqlTextError, tokenise } from './sql-tokens.js';
import type { LegacyEngine, Token } from './sql-tokens.js';

// The one table the original project had, in both its engines:
// src/persistence/mysql.js and src/persistence/sqlite.js at commit 42752ef.
//
//     todo_items (id varchar(36), name varchar(255), completed boolean)
//
// No owner, no project, no dates. What that costs to bring into our ten
// columns is decided one layer up; here we report what the dump says,
// including what it says is null.
const TABLE = 'todo_items';
const COLUMNS = ['id', 'name', 'completed'] as const;

export interface LegacyItem {
    id: string | null;
    name: string | null;
    completed: boolean | null;
    // The line the row was read from, so a refusal can name it.
    line: number;
}

type Cell = string | boolean | null;

interface Reader {
    tokens: Token[];
    at: number;
}

function peek(reader: Reader): Token | undefined {
    return reader.tokens[reader.at];
}

function take(reader: Reader): Token {
    const token = reader.tokens[reader.at];
    if (token === undefined) {
        const last = reader.tokens[reader.tokens.length - 1];
        throw new SqlTextError(last?.line ?? 1, 'the dump ends in the middle of a statement');
    }

    reader.at += 1;
    return token;
}

function expect(reader: Reader, value: string): Token {
    const token = take(reader);
    if (token.value.toLowerCase() !== value) {
        throw new SqlTextError(token.line, `\`${value}\` was expected, \`${token.value}\` was read`);
    }

    return token;
}

function isWord(token: Token | undefined, value: string): boolean {
    return token?.kind === 'word' && token.value.toLowerCase() === value;
}

// A dump holds statements we have no use for: mysqldump's settings, the
// schema, the other tables. Skipping to the next `;` lets them pass without
// being understood.
function skipStatement(reader: Reader): void {
    while (reader.at < reader.tokens.length) {
        const token = take(reader);
        if (token.kind === 'punct' && token.value === ';') return;
    }
}

// `insert into todo_items`, whatever the quoting and the case. A qualified
// name (`legacy.todo_items`) keeps only its last part.
function startsInsertIntoTable(reader: Reader): boolean {
    if (!isWord(peek(reader), 'insert')) return false;
    if (!isWord(reader.tokens[reader.at + 1], 'into')) return false;

    const name = reader.tokens[reader.at + 2];
    if (name?.kind !== 'word') return false;

    return name.value.toLowerCase().split('.').pop() === TABLE;
}

// The order the statement declares, or the table's own when it declares none,
// which is what both dumps write unless asked otherwise. A name we do not know
// is refused rather than ignored: a fourth column means this is not the table
// we think it is.
function readColumnOrder(reader: Reader): readonly string[] {
    if (peek(reader)?.value !== '(') return COLUMNS;

    const opening = take(reader);
    const order: string[] = [];

    for (;;) {
        const token = take(reader);

        if (token.value === ')') break;
        if (token.value === ',') continue;

        const name = token.value.toLowerCase();
        if (!COLUMNS.includes(name as (typeof COLUMNS)[number])) {
            throw new SqlTextError(token.line, `\`${name}\` is not a column of ${TABLE}`);
        }

        order.push(name);
    }

    if (order.length !== COLUMNS.length) {
        throw new SqlTextError(opening.line, `${TABLE} has three columns, the list names fewer`);
    }

    return order;
}

function readCell(reader: Reader): Cell {
    const token = take(reader);

    if (token.kind === 'string') return token.value;
    // The columns are varchars, so both dumps quote them; a bare number is
    // unambiguous all the same.
    if (token.kind === 'number') return token.value;

    if (token.kind === 'word') {
        const word = token.value.toLowerCase();
        if (word === 'null') return null;
        if (word === 'true') return true;
        if (word === 'false') return false;
    }

    // Reached by `x'4f6b'`, which mysqldump writes with --hex-blob: the
    // tokeniser hands over the word `x` then a string, and guessing which of
    // the two holds the value is what this tool must not do.
    throw new SqlTextError(token.line, `\`${token.value}\` is not a value`);
}

function asText(cell: Cell, line: number, column: string): string | null {
    if (cell === null || typeof cell === 'string') return cell;
    throw new SqlTextError(line, `${column} holds a boolean, where text was expected`);
}

// SQLite has no boolean and MySQL stores one as a tinyint, so both write 0 and
// 1. The keywords are accepted too, for a dump written by hand.
function asFlag(cell: Cell, line: number): boolean | null {
    if (cell === null || typeof cell === 'boolean') return cell;
    if (cell === '0') return false;
    if (cell === '1') return true;

    throw new SqlTextError(line, `completed holds \`${cell}\`, which is neither 0 nor 1`);
}

function readRow(reader: Reader, order: readonly string[]): LegacyItem {
    const line = expect(reader, '(').line;
    const cells = new Map<string, Cell>();

    for (const column of order) {
        cells.set(column, readCell(reader));
        if (peek(reader)?.value === ',') take(reader);
    }

    expect(reader, ')');

    return {
        id: asText(cells.get('id') ?? null, line, 'id'),
        name: asText(cells.get('name') ?? null, line, 'name'),
        completed: asFlag(cells.get('completed') ?? null, line),
        line,
    };
}

function readInsert(reader: Reader, items: LegacyItem[]): void {
    expect(reader, 'insert');
    expect(reader, 'into');
    take(reader);

    const order = readColumnOrder(reader);
    expect(reader, 'values');

    for (;;) {
        items.push(readRow(reader, order));

        if (peek(reader)?.value !== ',') break;
        take(reader);
    }

    skipStatement(reader);
}

// Every `todo_items` row a dump carries, in the order the dump carries them.
//
// Throws on a file it does not understand rather than returning what it could
// read: half a migration is worse than none, because nothing downstream would
// know which half is missing.
export function readLegacyDump(dump: string, engine: LegacyEngine): LegacyItem[] {
    const reader: Reader = { tokens: tokenise(dump, engine), at: 0 };
    const items: LegacyItem[] = [];

    while (reader.at < reader.tokens.length) {
        if (startsInsertIntoTable(reader)) readInsert(reader, items);
        else skipStatement(reader);
    }

    return items;
}
