// Reading the text of a dump, one token at a time.
//
// A dump is what one keeps of a system one is leaving, so reading it must need
// nothing but the file: no server, no driver, no dependency. That makes it text
// work, and the two engines do not write that text the same way.
//
// Why tokens rather than a regular expression over the `insert` statements: a
// task name may contain a parenthesis, a comma, a quote or a semicolon, and a
// comment may contain the word `insert`. Anything that does not track where a
// string literal starts and ends will eventually cut a row in half, and it
// will do it silently.

export type LegacyEngine = 'mysql' | 'sqlite';

export type TokenKind = 'word' | 'string' | 'number' | 'punct';

export interface Token {
    kind: TokenKind;
    // For a `word`, the identifier or keyword with its quotes removed; for a
    // `string`, the value with its escapes resolved.
    value: string;
    line: number;
}

// Names the line: a dump is read by whoever produced it, and "line 4182" is
// something they can go and look at.
export class SqlTextError extends Error {
    constructor(
        readonly line: number,
        reason: string,
    ) {
        super(`line ${line}: ${reason}`);
        this.name = new.target.name;
    }
}

// The escapes mysqldump writes inside a single-quoted literal.
//
// SQLite writes none of them: there, a backslash is a backslash and `''` is
// the only escape. Reading a SQLite dump with MySQL's rules would merge two
// columns as soon as a task name ended with a backslash -- which is why this
// module takes an engine rather than accepting both conventions at once.
const MYSQL_ESCAPES: Record<string, string> = {
    '0': '\0',
    b: '\b',
    n: '\n',
    r: '\r',
    t: '\t',
    Z: '\u001a',
    '\\': '\\',
    "'": "'",
    '"': '"',
};

const WORD = /[A-Za-z0-9_$.]/u;
const WORD_OR_SIGN = /[A-Za-z0-9_$.+-]/u;
const NUMBER = /^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/u;

interface Scan {
    at: number;
    line: number;
}

function newlines(text: string): number {
    return text.split('\n').length - 1;
}

function skipToEndOfLine(sql: string, scan: Scan): void {
    const end = sql.indexOf('\n', scan.at);
    scan.at = end === -1 ? sql.length : end;
}

function skipBlockComment(sql: string, scan: Scan): void {
    const end = sql.indexOf('*/', scan.at + 2);
    if (end === -1) throw new SqlTextError(scan.line, 'a block comment is never closed');

    scan.line += newlines(sql.slice(scan.at, end));
    scan.at = end + 2;
}

// Whitespace and the three comment forms a dump carries: `--` and `#` to the
// end of the line, `/* */` over several. mysqldump writes its own settings as
// conditional comments (`/*!40101 set ... */`), which are comments all the
// same.
function skipBlank(sql: string, scan: Scan): void {
    for (;;) {
        const char = sql.charAt(scan.at);

        if (char === '\n') {
            scan.line += 1;
            scan.at += 1;
        } else if (char === ' ' || char === '\t' || char === '\r') {
            scan.at += 1;
        } else if (char === '#' || sql.startsWith('--', scan.at)) {
            skipToEndOfLine(sql, scan);
        } else if (sql.startsWith('/*', scan.at)) {
            skipBlockComment(sql, scan);
        } else {
            return;
        }
    }
}

function escapedChar(sql: string, at: number, line: number): string {
    const escaped = sql.charAt(at + 1);
    if (escaped === '') throw new SqlTextError(line, 'a string literal ends on an escape');

    return MYSQL_ESCAPES[escaped] ?? escaped;
}

function readString(sql: string, scan: Scan, engine: LegacyEngine): Token {
    const line = scan.line;
    let value = '';
    let at = scan.at + 1;
    let crossed = 0;

    for (;;) {
        const char = sql.charAt(at);

        if (char === '') throw new SqlTextError(line, 'a string literal is never closed');

        if (char === "'" && sql.charAt(at + 1) !== "'") {
            scan.at = at + 1;
            scan.line = line + crossed;
            return { kind: 'string', value, line };
        }

        if (char === "'") {
            value += "'";
            at += 2;
            continue;
        }

        if (char === '\\' && engine === 'mysql') {
            value += escapedChar(sql, at, line);
            at += 2;
            continue;
        }

        if (char === '\n') crossed += 1;
        value += char;
        at += 1;
    }
}

function readQuotedName(sql: string, scan: Scan, quote: string): Token {
    const end = sql.indexOf(quote, scan.at + 1);
    if (end === -1) throw new SqlTextError(scan.line, 'a quoted name is never closed');

    const token: Token = { kind: 'word', value: sql.slice(scan.at + 1, end), line: scan.line };
    scan.at = end + 1;
    return token;
}

function readWordOrNumber(sql: string, scan: Scan): Token {
    if (/[\d+-]/u.test(sql.charAt(scan.at))) {
        const number = NUMBER.exec(sql.slice(scan.at));
        if (number === null) throw new SqlTextError(scan.line, 'a number was expected');

        const token: Token = { kind: 'number', value: number[0], line: scan.line };
        scan.at += number[0].length;
        return token;
    }

    let end = scan.at;
    while (WORD.test(sql.charAt(end))) end += 1;

    const token: Token = { kind: 'word', value: sql.slice(scan.at, end), line: scan.line };
    scan.at = end;
    return token;
}

export function tokenise(sql: string, engine: LegacyEngine): Token[] {
    const tokens: Token[] = [];
    const scan: Scan = { at: 0, line: 1 };
    // A double quote opens a name in a SQLite dump; in a MySQL one it opens a
    // value, or a name under ANSI_QUOTES. Decided once, here.
    const nameQuotes = engine === 'sqlite' ? '`"' : '`';

    for (;;) {
        skipBlank(sql, scan);

        const char = sql.charAt(scan.at);
        if (char === '') return tokens;

        if (char === "'") {
            tokens.push(readString(sql, scan, engine));
        } else if (nameQuotes.includes(char)) {
            tokens.push(readQuotedName(sql, scan, char));
        } else if (char === '"') {
            // Reading it either way would be a guess, and mysqldump writes
            // neither -- so the likeliest cause is a SQLite dump read with the
            // wrong engine.
            throw new SqlTextError(scan.line, 'a double quote, which mysqldump does not write');
        } else if (WORD_OR_SIGN.test(char)) {
            tokens.push(readWordOrNumber(sql, scan));
        } else {
            tokens.push({ kind: 'punct', value: char, line: scan.line });
            scan.at += 1;
        }
    }
}
