import { describe, expect, it } from 'vitest';

import { readLegacyDump } from './legacy-dump.js';
import { SqlTextError } from './sql-tokens.js';

// What mysqldump writes, kept down to the shape that matters: its conditional
// comments, the schema it recreates, and one extended insert -- the form it
// uses unless asked for one statement per row.
const MYSQL = `-- MySQL dump 10.13  Distrib 8.0.36, for Linux (x86_64)
--
-- Host: localhost    Database: legacy
-- ------------------------------------------------------
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
DROP TABLE IF EXISTS \`todo_items\`;
CREATE TABLE \`todo_items\` (
  \`id\` varchar(36) NOT NULL,
  \`name\` varchar(255) DEFAULT NULL,
  \`completed\` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO \`todo_items\` VALUES ('0191f3c2-1111-7000-8000-aaaaaaaaaaaa','Acheter du pain',0),('0191f3c2-2222-7000-8000-bbbbbbbbbbbb','Relire le sujet',1);
-- Dump completed on 2026-09-12 11:04:02
`;

// What `sqlite3 legacy.db .dump` writes: one statement per row, and a doubled
// quote as the only escape.
const SQLITE = `PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE todo_items (id varchar(36), name varchar(255), completed boolean);
INSERT INTO todo_items VALUES('0191f3c2-1111-7000-8000-aaaaaaaaaaaa','Acheter du pain',0);
INSERT INTO todo_items VALUES('0191f3c2-2222-7000-8000-bbbbbbbbbbbb','C''est fait',1);
COMMIT;
`;

describe('readLegacyDump', () => {
    it('reads the rows of an extended insert written by mysqldump', () => {
        const items = readLegacyDump(MYSQL, 'mysql');

        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({
            id: '0191f3c2-1111-7000-8000-aaaaaaaaaaaa',
            name: 'Acheter du pain',
            completed: false,
        });
        expect(items[1]).toMatchObject({ name: 'Relire le sujet', completed: true });
    });

    it('reads one statement per row, and a doubled quote, from a sqlite dump', () => {
        const items = readLegacyDump(SQLITE, 'sqlite');

        expect(items).toHaveLength(2);
        expect(items[1]?.name).toBe("C'est fait");
    });

    it('resolves the escapes mysqldump writes inside a literal', () => {
        const dump = `INSERT INTO \`todo_items\` VALUES ('a','C\\'est \\"fait\\" a 50\\\\50',1);`;

        expect(readLegacyDump(dump, 'mysql')[0]?.name).toBe('C\'est "fait" a 50\\50');
    });

    // The reason this module takes an engine. SQLite writes a backslash as
    // itself, so applying MySQL's rules here would read the next quote as
    // escaped, swallow the column separator and merge two columns into one.
    it('keeps a trailing backslash in a sqlite dump, where it is not an escape', () => {
        const dump = `INSERT INTO todo_items VALUES('a','chemin\\',0);`;

        expect(readLegacyDump(dump, 'sqlite')[0]?.name).toBe('chemin\\');
    });

    it('keeps a null as a null, in any column', () => {
        const dump = `INSERT INTO todo_items VALUES('a',NULL,NULL);`;

        expect(readLegacyDump(dump, 'sqlite')[0]).toMatchObject({ name: null, completed: null });
    });

    it('accepts the boolean keywords as well as 0 and 1', () => {
        const dump = `INSERT INTO todo_items VALUES('a','x',TRUE),('b','y',false);`;

        const items = readLegacyDump(dump, 'sqlite');
        expect(items.map(item => item.completed)).toEqual([true, false]);
    });

    it('follows the column order the statement declares', () => {
        const dump = `INSERT INTO todo_items (completed, id, name) VALUES (1,'a','Relire');`;

        expect(readLegacyDump(dump, 'mysql')[0]).toMatchObject({
            id: 'a',
            name: 'Relire',
            completed: true,
        });
    });

    it('refuses a column it does not know, naming its line', () => {
        const dump = `-- one comment line\nINSERT INTO todo_items (id, name, owner) VALUES ('a','x','b');`;

        expect(() => readLegacyDump(dump, 'mysql')).toThrow(SqlTextError);
        expect(() => readLegacyDump(dump, 'mysql')).toThrow(/line 2:.*owner/u);
    });

    it('ignores the other tables of the same database', () => {
        const dump = `INSERT INTO users VALUES ('a','b@example.com');
INSERT INTO todo_items VALUES ('a','Relire',0);`;

        expect(readLegacyDump(dump, 'mysql')).toHaveLength(1);
    });

    // The whole point of reading tokens rather than matching a pattern: a
    // statement that quotes our insert carries a value, not an insert.
    it('does not take an insert quoted inside a literal for a statement', () => {
        const dump = `INSERT INTO notes VALUES ('INSERT INTO todo_items VALUES (1,2,3)');`;

        expect(readLegacyDump(dump, 'mysql')).toEqual([]);
    });

    // A comment is skipped before anything tries to read it, so its apostrophe
    // never opens a literal -- which would have swallowed the rows below it.
    it('reads past a comment that contains an apostrophe', () => {
        const dump = `-- dump of the user's tasks\nINSERT INTO todo_items VALUES ('a','Relire',0);`;

        expect(readLegacyDump(dump, 'mysql')).toHaveLength(1);
    });

    it('refuses a literal that is never closed, naming its line', () => {
        const dump = `INSERT INTO todo_items VALUES\n('a','Relire,0);`;

        expect(() => readLegacyDump(dump, 'sqlite')).toThrow(/line 2:.*never closed/u);
    });

    // mysqldump --hex-blob writes `x'52656c69726'`. The tokeniser hands over a
    // word then a string, and which of the two is the value is a guess.
    it('refuses a hexadecimal literal rather than guessing what it holds', () => {
        const dump = `INSERT INTO todo_items VALUES ('a',x'52656c69726',0);`;

        expect(() => readLegacyDump(dump, 'mysql')).toThrow(SqlTextError);
    });

    it('reports the line each row was read from', () => {
        const items = readLegacyDump(MYSQL, 'mysql');

        expect(items.map(item => item.line)).toEqual([13, 13]);
    });
});
