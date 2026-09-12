import { SqlTextError } from './sql-tokens.js';
import type { Token } from './sql-tokens.js';

// Walking a list of tokens, for the two readers that need it: the legacy
// export and our own. Extracted when the second one arrived, rather than
// copied -- two cursors over the same grammar would drift.

export type Cell = string | boolean | null;

export interface Reader {
    tokens: readonly Token[];
    at: number;
}

export function reader(tokens: readonly Token[]): Reader {
    return { tokens, at: 0 };
}

export function peek(input: Reader): Token | undefined {
    return input.tokens[input.at];
}

export function take(input: Reader): Token {
    const token = input.tokens[input.at];
    if (token === undefined) {
        const last = input.tokens[input.tokens.length - 1];
        throw new SqlTextError(last?.line ?? 1, 'the export ends in the middle of a statement');
    }

    input.at += 1;
    return token;
}

export function expect(input: Reader, value: string): Token {
    const token = take(input);
    if (token.value.toLowerCase() !== value) {
        throw new SqlTextError(token.line, `\`${value}\` was expected, \`${token.value}\` was read`);
    }

    return token;
}

export function isWord(token: Token | undefined, value: string): boolean {
    return token?.kind === 'word' && token.value.toLowerCase() === value;
}

// An export holds statements we have no use for: the settings a dump tool
// writes, the schema, the tables we do not read. Skipping to the next `;` lets
// them pass without being understood.
export function skipStatement(input: Reader): void {
    while (input.at < input.tokens.length) {
        const token = take(input);
        if (token.kind === 'punct' && token.value === ';') return;
    }
}

export function readCell(input: Reader): Cell {
    const token = take(input);

    if (token.kind === 'string') return token.value;
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

// The name `insert into` targets, in parts: `['public', 'items']`.
//
// A qualified name arrives as three tokens when it is quoted
// (`"public"."items"`) and as one when it is not (`public.items`), because a
// dot belongs to a word. Both are returned split, and the qualifier is kept:
// dropping it would read `insert into "auth"."users"` as our own `users`, and
// an export carrying both schemas would mix them.
export function insertedName(input: Reader): readonly string[] | undefined {
    if (!isWord(peek(input), 'insert')) return undefined;
    if (!isWord(input.tokens[input.at + 1], 'into')) return undefined;

    let at = input.at + 2;
    const parts: string[] = [];

    for (;;) {
        const token = input.tokens[at];
        if (token?.kind !== 'word') break;

        parts.push(...token.value.toLowerCase().split('.'));

        if (input.tokens[at + 1]?.value !== '.') break;
        at += 2;
    }

    return parts.length === 0 ? undefined : parts;
}

// Moves the cursor past `insert into <name>`, whatever shape the name had.
export function skipInsertInto(input: Reader): void {
    expect(input, 'insert');
    expect(input, 'into');
    take(input);

    while (peek(input)?.value === '.') {
        take(input);
        take(input);
    }
}
