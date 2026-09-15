import { beforeAll, describe, expect, it } from 'vitest';

import { buildImportScript } from '../../packages/data-migration/src/import-script.js';
import type { ImportTarget } from '../../packages/data-migration/src/import-script.js';
import { readLegacyDump } from '../../packages/data-migration/src/legacy-dump.js';
import { readPostgresDump } from '../../packages/data-migration/src/postgres-dump.js';
import { renderData } from '../../packages/data-migration/src/render-data.js';
import { renderSchema } from '../../packages/data-migration/src/render-schema.js';
import {
    mysqlAdmin,
    mysqlAsk,
    mysqlDump,
    mysqlRun,
    postgresAdmin,
    postgresAsk,
    postgresDump,
    postgresRun,
    sqliteAsk,
    sqliteReset,
    sqliteRun,
} from './containers.js';

// The whole claim of the ADR-0017, executed rather than asserted: data comes
// in from the engines the original project used, and goes back out to them.
//
// What the round trip runs against is the schema `renderSchema('postgres')`
// produces, not the one the migrations build: a plain PostgreSQL has neither
// the auth schema nor the roles our migrations need. That the rendered schema
// is a faithful copy of the real one is the job of the guard against
// information_schema, which runs at the integration level.

const LEGACY = 'legacy';
const TARGET = 'legacy22';
const OWNER = '00000000-0000-7000-8000-000000000001';
const BACKSLASHES = 'Nom avec une contre-oblique \\\\ dedans';

const IMPORT: ImportTarget = {
    source: 'legacy.sql',
    engine: 'mysql',
    ownerEmail: 'proprietaire@example.com',
    projectId: '0191f3c2-9999-7000-8000-ffffffffffff',
    projectName: "Reprise du legacy, avec une apostrophe pour l'occasion",
    at: '2026-09-12T12:00:00.000Z',
};

// The three columns the original project had, and six rows chosen for what
// they cost: an apostrophe, backslashes, an identifier that is not a UUID and
// a name that is empty.
//
// The backslashes are doubled on the way in, because MySQL reads one as an
// escape inside a literal -- the same rule the export applies in the other
// direction. Written this way, BACKSLASHES stays the value the row actually
// holds, which is what every assertion below compares against.
const FIXTURES = `
create table todo_items (id varchar(36), name varchar(255), completed boolean);
insert into todo_items values
  ('0191f3c2-1111-7000-8000-aaaaaaaaaaaa', 'Acheter du pain', 0),
  ('0191f3c2-2222-7000-8000-bbbbbbbbbbbb', 'C''est fait', 1),
  ('0191f3c2-3333-7000-8000-cccccccccccc', 'Relire le sujet', 0),
  ('0191f3c2-4444-7000-8000-dddddddddddd', '${BACKSLASHES.replaceAll('\\', '\\\\')}', 1),
  ('pas-un-uuid', 'Un identifiant que notre schema refuse', 0),
  ('0191f3c2-5555-7000-8000-eeeeeeeeeeee', '', 0);
`;

// Every database this suite touches lives in the containers of the `migration`
// profile, and is remade from nothing on each run: a proof that starts from an
// inherited state proves nothing.
function freshTarget(database: string): void {
    postgresAdmin(`drop database if exists ${database}`);
    postgresAdmin(`create database ${database}`);
    postgresRun(database, renderSchema('postgres'));
}

function freshMysql(database: string): void {
    mysqlAdmin(`drop database if exists ${database}`);
    mysqlAdmin(`create database ${database}`);
}

let script = '';
let refused: readonly { line: number; reason: string }[] = [];

beforeAll(() => {
    freshMysql(LEGACY);
    mysqlRun(LEGACY, FIXTURES);

    freshTarget(TARGET);
    // The account the import attaches the tasks to. Our own database fills
    // this table from a trigger on auth.users; a plain PostgreSQL has neither,
    // which is exactly the part ADR-0017 names as the cost of leaving.
    postgresRun(
        TARGET,
        `insert into "users" ("id", "email", "created_at", "updated_at")
         values ('${OWNER}', '${IMPORT.ownerEmail}', now(), now());`,
    );

    const built = buildImportScript(
        readLegacyDump(mysqlDump(LEGACY, 'todo_items'), 'mysql'),
        IMPORT,
    );
    script = built.sql;
    refused = built.report.refused;
});

describe('from a MySQL export into our PostgreSQL', () => {
    it('takes the rows our schema accepts, and names the ones it does not', () => {
        postgresRun(TARGET, script);

        expect(postgresAsk(TARGET, 'select count(*) from "items"')).toBe('4');
        expect(refused.map(note => note.reason)).toEqual([
            expect.stringContaining('is not a UUID'),
            'the name is empty',
        ]);
    });

    it('keeps an apostrophe and a backslash exactly as the legacy held them', () => {
        const names = postgresAsk(TARGET, 'select "name" from "items" order by "name"').split('\n');

        expect(names).toContain("C'est fait");
        expect(names).toContain(BACKSLASHES);
    });

    it('reads the legacy flag as the Kanban status', () => {
        expect(postgresAsk(TARGET, `select count(*) from "items" where "status" = 'done'`)).toBe(
            '2',
        );
    });

    it('creates the project and attaches it to the account, once', () => {
        expect(postgresAsk(TARGET, 'select count(*) from "projects"')).toBe('1');
        expect(postgresAsk(TARGET, 'select "role" from "project_memberships"')).toBe('owner');
    });

    // The property the whole script is shaped around: a first run that failed
    // half way, or a second operator running it again, must not duplicate.
    it('inserts nothing when applied a second time', () => {
        postgresRun(TARGET, script);

        expect(postgresAsk(TARGET, 'select count(*) from "items"')).toBe('4');
        expect(postgresAsk(TARGET, 'select count(*) from "projects"')).toBe('1');
    });

    it('cancels the whole import when no account carries the address', () => {
        const unknown = script.replaceAll(IMPORT.ownerEmail, 'inconnu@example.com');

        expect(() => postgresRun(TARGET, unknown)).toThrow(/the import is cancelled/u);
    });
});

describe('from our PostgreSQL out to another engine', () => {
    it('fills a MySQL with the same rows, and the same characters', () => {
        const snapshot = readPostgresDump(postgresDump(TARGET));

        freshMysql(TARGET);
        mysqlRun(TARGET, renderSchema('mysql'));
        mysqlRun(TARGET, renderData(snapshot, 'mysql'));

        expect(mysqlAsk(TARGET, 'select count(*) from items')).toBe('4');
        expect(
            mysqlAsk(TARGET, `select char_length(name) from items where name like '%oblique%'`),
        ).toBe(String(BACKSLASHES.length));
        expect(mysqlAsk(TARGET, `select count(*) from items where name = "C'est fait"`)).toBe('1');
        expect(mysqlAsk(TARGET, 'select count(*) from projects')).toBe('1');
    });

    it('fills a SQLite with the same rows, and the same characters', () => {
        const snapshot = readPostgresDump(postgresDump(TARGET));

        sqliteReset();
        sqliteRun(renderSchema('sqlite'));
        sqliteRun(renderData(snapshot, 'sqlite'));

        expect(sqliteAsk('select count(*) from items')).toBe('4');
        expect(sqliteAsk(`select length(name) from items where name like '%oblique%'`)).toBe(
            String(BACKSLASHES.length),
        );
        expect(sqliteAsk(`select status from items where name = 'C''est fait'`)).toBe('done');
    });

    // The faithful exit of the three: a PostgreSQL rebuilt from our own
    // rendering loses nothing, which is what makes the other two a choice
    // rather than a fallback.
    it('rebuilds an identical PostgreSQL elsewhere', () => {
        const snapshot = readPostgresDump(postgresDump(TARGET));
        const elsewhere = 'legacy22_ailleurs';

        freshTarget(elsewhere);
        postgresRun(elsewhere, renderData(snapshot, 'postgres'));

        for (const table of ['users', 'projects', 'project_memberships', 'items']) {
            expect(postgresAsk(elsewhere, `select count(*) from "${table}"`)).toBe(
                postgresAsk(TARGET, `select count(*) from "${table}"`),
            );
        }

        expect(
            postgresAsk(elsewhere, `select "name" from "items" where "name" like '%oblique%'`),
        ).toBe(BACKSLASHES);
    });

    it('carries no account and no password out of GoTrue', () => {
        const data = renderData(readPostgresDump(postgresDump(TARGET)), 'mysql');

        expect(data).toContain('Accounts and passwords are not here');
        expect(data).not.toMatch(/encrypted_password|auth\./u);
    });
});
