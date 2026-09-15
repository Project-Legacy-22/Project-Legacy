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
import { SqlTextError, tokenise } from './sql-tokens.js';
import type { LegacyEngine } from './sql-tokens.js';

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

// The order the statement declares, or the table's own when it declares none,
// which is what both dumps write unless asked otherwise. A name we do not know
// is refused rather than ignored: a fourth column means this is not the table
// we think it is.
function readColumnOrder(input: Reader): readonly string[] {
    if (peek(input)?.value !== '(') return COLUMNS;

    const opening = take(input);
    const order: string[] = [];

    for (;;) {
        const token = take(input);

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

function readRow(input: Reader, order: readonly string[]): LegacyItem {
    const line = expect(input, '(').line;
    const cells = new Map<string, Cell>();

    for (const column of order) {
        cells.set(column, readCell(input));
        if (peek(input)?.value === ',') take(input);
    }

    expect(input, ')');

    return {
        id: asText(cells.get('id') ?? null, line, 'id'),
        name: asText(cells.get('name') ?? null, line, 'name'),
        completed: asFlag(cells.get('completed') ?? null, line),
        line,
    };
}

function readInsert(input: Reader, items: LegacyItem[]): void {
    skipInsertInto(input);

    const order = readColumnOrder(input);
    expect(input, 'values');

    for (;;) {
        items.push(readRow(input, order));

        if (peek(input)?.value !== ',') break;
        take(input);
    }

    skipStatement(input);
}

// Every `todo_items` row a dump carries, in the order the dump carries them.
//
// Throws on a file it does not understand rather than returning what it could
// read: half a migration is worse than none, because nothing downstream would
// know which half is missing.
export function readLegacyDump(dump: string, engine: LegacyEngine): LegacyItem[] {
    const input = reader(tokenise(dump, engine));
    const items: LegacyItem[] = [];

    while (input.at < input.tokens.length) {
        // The last part only: a legacy export may qualify the table with the
        // database it came from, and that prefix means nothing here.
        if (insertedName(input)?.at(-1) === TABLE) readInsert(input, items);
        else skipStatement(input);
    }

    return items;
}
