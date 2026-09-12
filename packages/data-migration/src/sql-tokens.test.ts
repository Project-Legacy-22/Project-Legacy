import { describe, expect, it } from 'vitest';

import { SqlTextError, tokenise } from './sql-tokens.js';

function values(sql: string, engine: 'mysql' | 'sqlite'): string[] {
    return tokenise(sql, engine).map(token => token.value);
}

describe('tokenise', () => {
    it('separates names, values, numbers and punctuation', () => {
        const tokens = tokenise(`INSERT INTO \`todo_items\` VALUES ('a','Relire',0);`, 'mysql');

        expect(tokens.map(token => [token.kind, token.value])).toEqual([
            ['word', 'INSERT'],
            ['word', 'INTO'],
            ['word', 'todo_items'],
            ['word', 'VALUES'],
            ['punct', '('],
            ['string', 'a'],
            ['punct', ','],
            ['string', 'Relire'],
            ['punct', ','],
            ['number', '0'],
            ['punct', ')'],
            ['punct', ';'],
        ]);
    });

    // A comment is skipped before anything tries to read it, so its apostrophe
    // never opens a literal -- which would have swallowed everything after it.
    it('skips the three comment forms, apostrophe included', () => {
        const sql = `-- dump of the user's tasks
# another setting
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
SELECT 1;`;

        expect(values(sql, 'mysql')).toEqual([';', 'SELECT', '1', ';']);
    });

    it('resolves the escapes mysqldump writes inside a literal', () => {
        expect(values(`'C\\'est \\"fait\\" a 50\\\\50'`, 'mysql')).toEqual(['C\'est "fait" a 50\\50']);
        expect(values(`'deux\\nlignes'`, 'mysql')).toEqual(['deux\nlignes']);
    });

    // The reason this module takes an engine rather than accepting both
    // conventions at once. Under MySQL's rules the quote after the backslash
    // would read as escaped, and the literal would swallow what follows it.
    it('leaves a backslash alone in a sqlite dump, where it is not an escape', () => {
        expect(values(`'chemin\\','x'`, 'sqlite')).toEqual(['chemin\\', ',', 'x']);
    });

    it('reads a doubled quote as one quote, in both engines', () => {
        expect(values(`'C''est fait'`, 'sqlite')).toEqual(["C'est fait"]);
        expect(values(`'C''est fait'`, 'mysql')).toEqual(["C'est fait"]);
    });

    it('reads a double-quoted name as a name in a sqlite dump', () => {
        expect(tokenise(`INSERT INTO "todo items" VALUES(1)`, 'sqlite')[2]).toMatchObject({
            kind: 'word',
            value: 'todo items',
        });
    });

    // Neither reading is safe: in MySQL a double quote opens a value, or a
    // name under ANSI_QUOTES. mysqldump writes none, so the likeliest cause is
    // a SQLite dump read with the wrong engine, and saying so beats guessing.
    it('refuses a double quote in a mysql dump', () => {
        expect(() => tokenise(`INSERT INTO "todo_items" VALUES(1)`, 'mysql')).toThrow(SqlTextError);
    });

    it('counts the lines a statement and a literal cross', () => {
        const sql = `SELECT\n1,\n'sur\ndeux lignes',\n2`;

        expect(tokenise(sql, 'sqlite').map(token => token.line)).toEqual([1, 2, 2, 3, 4, 5]);
    });

    it('refuses a literal that is never closed, naming its line', () => {
        expect(() => tokenise(`SELECT 1;\nSELECT 'ouvert`, 'mysql')).toThrow(/line 2:.*never closed/u);
    });

    it('refuses a block comment that is never closed', () => {
        expect(() => tokenise(`/* ouvert`, 'mysql')).toThrow(/never closed/u);
    });

    it('reads a signed number as one token', () => {
        expect(values(`VALUES (-1, +2, 3.5)`, 'sqlite')).toEqual([
            'VALUES',
            '(',
            '-1',
            ',',
            '+2',
            ',',
            '3.5',
            ')',
        ]);
    });
});
