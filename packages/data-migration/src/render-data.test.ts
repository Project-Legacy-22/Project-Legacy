import { describe, expect, it } from 'vitest';

import { readPostgresDump } from './postgres-dump.js';
import { ExportError, renderData } from './render-data.js';
import type { Dialect } from './render-schema.js';

const DIALECTS: Dialect[] = ['postgres', 'mysql', 'sqlite'];

function dumpOf(values: string): string {
    return `INSERT INTO "public"."items" ("id", "user_id", "name", "created_at", "updated_at", "project_id", "status", "version", "priority", "due_date") VALUES\n\t(${values});`;
}

const ROW = dumpOf(
    `'0191f3c2-1111-7000-8000-aaaaaaaaaaaa', '00000000-0000-7000-8000-000000000001', 'Acheter du pain', '2026-09-12 13:15:15.009+00', '2026-09-12 13:15:15.009+00', '01a095bb-633d-774f-aeab-4933ea0ce35e', 'todo', 1, 'normal', NULL`,
);

function render(dump: string, dialect: Dialect): string {
    return renderData(readPostgresDump(dump), dialect);
}

describe('renderData', () => {
    it.each(DIALECTS)('wraps every insertion in one transaction for %s', dialect => {
        const sql = render(ROW, dialect);

        expect(sql).toContain('begin;');
        expect(sql.trimEnd().endsWith('commit;')).toBe(true);
    });

    // A target filled half way would be worse than one left empty, because
    // nothing would say which half arrived.
    it.each(DIALECTS)('inserts in the order references allow for %s', dialect => {
        const sql = render(ROW, dialect);

        expect(sql.indexOf('insert into')).toBeGreaterThan(-1);
        expect(sql.indexOf('items')).toBeGreaterThan(sql.indexOf('users'));
    });

    it.each(DIALECTS)('names a table the export did not carry, rather than skipping it for %s', dialect => {
        expect(render(ROW, dialect)).toContain('outbox: the export carried no row');
    });

    it.each(DIALECTS)('keeps a null as a null and an integer unquoted for %s', dialect => {
        const sql = render(ROW, dialect);

        expect(sql).toContain(', null)');
        expect(sql).toMatch(/'todo', 1, 'normal'/u);
    });

    it('keeps the offset PostgreSQL wrote when the target is PostgreSQL', () => {
        expect(render(ROW, 'postgres')).toContain("'2026-09-12 13:15:15.009+00'");
    });

    // Neither datetime(6) nor SQLite text carries a zone. The export writes
    // UTC without one, and the header says so.
    it.each(['mysql', 'sqlite'] as const)('drops the zone for %s, which cannot hold one', dialect => {
        const sql = render(ROW, dialect);

        expect(sql).toContain("'2026-09-12 13:15:15.009'");
        expect(sql).not.toContain('+00');
        expect(sql).toContain('UTC without a zone');
    });

    // Measured on MySQL 8.4: a backslash is an escape inside a literal there,
    // so a name holding two of them arrives holding one unless they are
    // doubled. PostgreSQL with standard_conforming_strings on and SQLite keep
    // a backslash as itself, and doubling it there would add one.
    it('doubles a backslash for MySQL, and only for MySQL', () => {
        const dump = dumpOf(
            `'a', 'b', 'contre-oblique \\\\ dedans', '2026-09-12 13:15:15+00', '2026-09-12 13:15:15+00', 'c', 'todo', 1, 'normal', NULL`,
        );

        expect(render(dump, 'mysql')).toContain('contre-oblique \\\\\\\\ dedans');
        expect(render(dump, 'sqlite')).toContain('contre-oblique \\\\ dedans');
        expect(render(dump, 'postgres')).toContain('contre-oblique \\\\ dedans');
    });

    it.each(DIALECTS)('doubles a quote so it closes nothing for %s', dialect => {
        const dump = dumpOf(
            `'a', 'b', 'C''est fait', '2026-09-12 13:15:15+00', '2026-09-12 13:15:15+00', 'c', 'todo', 1, 'normal', NULL`,
        );

        expect(render(dump, dialect)).toContain("'C''est fait'");
    });

    it.each(DIALECTS)('says in the file that no account comes with the data for %s', dialect => {
        expect(render(ROW, dialect)).toContain('Accounts and passwords are not here');
    });
});

describe('renderData refusals', () => {
    // Shifting every date by a guess is the kind of silence this tool exists
    // to avoid: the export must be produced in UTC, and the message says so.
    it.each(['mysql', 'sqlite'] as const)('refuses a timestamp that is not UTC for %s', dialect => {
        const dump = dumpOf(
            `'a', 'b', 'x', '2026-09-12 13:15:15+02', '2026-09-12 13:15:15+00', 'c', 'todo', 1, 'normal', NULL`,
        );

        expect(() => render(dump, dialect)).toThrow(ExportError);
        expect(() => render(dump, dialect)).toThrow(/server in UTC/u);
    });

    it('refuses a timestamp it cannot read at all', () => {
        const dump = dumpOf(
            `'a', 'b', 'x', 'hier', '2026-09-12 13:15:15+00', 'c', 'todo', 1, 'normal', NULL`,
        );

        expect(() => render(dump, 'mysql')).toThrow(/not a timestamp/u);
    });

    // The same value reaches PostgreSQL untouched, because there the column
    // holds the offset: only the two targets without a zone need the guard.
    it('leaves a timestamp with another offset alone when the target is PostgreSQL', () => {
        const dump = dumpOf(
            `'a', 'b', 'x', '2026-09-12 13:15:15+02', '2026-09-12 13:15:15+00', 'c', 'todo', 1, 'normal', NULL`,
        );

        expect(render(dump, 'postgres')).toContain("'2026-09-12 13:15:15+02'");
    });
});
