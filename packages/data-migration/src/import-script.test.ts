import { describe, expect, it } from 'vitest';

import { ImportTargetError, buildImportScript, renderReport } from './import-script.js';
import type { ImportTarget } from './import-script.js';
import type { LegacyItem } from './legacy-dump.js';

const TARGET: ImportTarget = {
    source: 'legacy.sql',
    engine: 'mysql',
    ownerEmail: 'someone@example.com',
    projectId: '0191f3c2-9999-7000-8000-cccccccccccc',
    projectName: 'Reprise du legacy',
    at: '2026-09-12T14:00:00.000Z',
};

function row(over: Partial<LegacyItem> = {}): LegacyItem {
    return {
        id: '0191f3c2-1111-7000-8000-aaaaaaaaaaaa',
        name: 'Acheter du pain',
        completed: false,
        line: 12,
        ...over,
    };
}

describe('buildImportScript', () => {
    it('wraps the whole import in one transaction', () => {
        const { sql } = buildImportScript([row()], TARGET);

        expect(sql).toMatch(/begin;/u);
        expect(sql.trimEnd().endsWith('commit;')).toBe(true);
    });

    // An address no account carries must cancel the import, not leave a project
    // nobody owns: the insert below it would otherwise run with a null owner.
    it('raises rather than importing when no account carries the address', () => {
        const { sql } = buildImportScript([row()], TARGET);

        expect(sql).toMatch(/select id into v_owner from public\.users where email = 'someone@example\.com'/u);
        expect(sql).toMatch(/if v_owner is null then\n\s+raise exception/u);
    });

    it('creates the project and its ownership before the tasks', () => {
        const { sql } = buildImportScript([row()], TARGET);

        const project = sql.indexOf('insert into public.projects');
        const membership = sql.indexOf('insert into public.project_memberships');
        const items = sql.indexOf('insert into public.items');

        expect(project).toBeGreaterThan(-1);
        expect(project).toBeLessThan(membership);
        expect(membership).toBeLessThan(items);
    });

    // Replayable by construction: identifiers come from the export, the project
    // one is supplied, and every insert absorbs the row it already wrote.
    it('inserts nothing twice when applied again', () => {
        const { sql } = buildImportScript([row()], TARGET);

        expect(sql.match(/on conflict/gu)).toHaveLength(3);
    });

    it('reads completed as the Kanban status', () => {
        const { sql } = buildImportScript(
            [row({ id: '0191f3c2-1111-7000-8000-aaaaaaaaaaaa', completed: true })],
            TARGET,
        );

        expect(sql).toMatch(/'0191f3c2-1111-7000-8000-aaaaaaaaaaaa', v_owner, .*'done'/su);
    });

    // Reading a null as `todo` is a reading, so the report says so. The
    // alternative -- refusing the row -- would lose a task whose name we know.
    it('reads a null completed as todo, and says so in the report', () => {
        const { sql, report } = buildImportScript([row({ completed: null })], TARGET);

        expect(sql).toMatch(/'todo'/u);
        expect(report.assumed).toEqual([{ line: 12, reason: 'completed was null, read as todo' }]);
    });

    it('doubles a quote inside a task name rather than closing the literal', () => {
        const { sql, report } = buildImportScript([row({ name: "C'est fait" })], TARGET);

        expect(sql).toContain("'C''est fait'");
        expect(report.refused).toEqual([]);
    });

    it('leaves the priority, the due date and the version to the schema', () => {
        const { sql } = buildImportScript([row()], TARGET);

        expect(sql).toContain('(id, user_id, project_id, name, status, created_at, updated_at)');
    });
});

describe('buildImportScript refusals', () => {
    const cases: [string, Partial<LegacyItem>, RegExp][] = [
        ['no identifier', { id: null }, /carries no identifier/u],
        ['an identifier that is not a UUID', { id: '42' }, /is not a UUID/u],
        ['a null name', { name: null }, /the name is null/u],
        ['an empty name', { name: '   ' }, /the name is empty/u],
        ['a name over 255 characters', { name: 'a'.repeat(256) }, /256 characters/u],
        ['a null byte in the name', { name: 'a\0b' }, /null byte/u],
        ['the block delimiter in the name', { name: 'a $reprise$ b' }, /delimits the generated/u],
    ];

    it.each(cases)('refuses a row with %s, and names its line', (_what, over, reason) => {
        const { sql, report } = buildImportScript([row(over)], TARGET);

        expect(report.taken).toBe(0);
        expect(report.refused).toHaveLength(1);
        expect(report.refused[0]?.line).toBe(12);
        expect(report.refused[0]?.reason).toMatch(reason);
        expect(sql).toContain('no row this import could take');
    });

    // `on conflict do nothing` would absorb the second one in silence, and the
    // export would look fully imported while one task never arrived.
    it('refuses the second row that carries an identifier already seen', () => {
        const { report } = buildImportScript([row(), row({ line: 30 })], TARGET);

        expect(report.taken).toBe(1);
        expect(report.refused).toHaveLength(1);
        expect(report.refused[0]?.line).toBe(30);
        expect(report.refused[0]?.reason).toMatch(/appears twice in the export/u);
    });

    it('refuses a target whose project identifier is not a UUID', () => {
        expect(() => buildImportScript([], { ...TARGET, projectId: 'reprise' })).toThrow(
            ImportTargetError,
        );
    });

    it('refuses a target whose address could close a literal', () => {
        expect(() => buildImportScript([], { ...TARGET, ownerEmail: "a'b@example.com" })).toThrow(
            ImportTargetError,
        );
    });
});

describe('renderReport', () => {
    it('names every refused row, so nothing is lost in silence', () => {
        const items = [
            row(),
            row({ id: null, line: 20 }),
            row({ id: '0191f3c2-3333-7000-8000-dddddddddddd', name: '', line: 21 }),
        ];

        const { report } = buildImportScript(items, TARGET);
        const text = renderReport(TARGET, report);

        expect(text).toContain('Rows taken    1');
        expect(text).toContain('Rows refused  2');
        expect(text).toMatch(/line 20: .*carries no identifier/u);
        expect(text).toMatch(/line 21: the name is empty/u);
        expect(text).toContain('legacy.sql (mysql)');
    });
});
