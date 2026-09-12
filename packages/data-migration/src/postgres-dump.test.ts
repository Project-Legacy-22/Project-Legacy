import { describe, expect, it } from 'vitest';

import { readPostgresDump } from './postgres-dump.js';
import { TABLES } from './schema.js';
import { SqlTextError } from './sql-tokens.js';

// What `supabase db dump --local --data-only -s public` writes, kept down to
// the shape that matters: its settings, its `\restrict` comment, a qualified
// and quoted table name, an explicit column list, and one statement holding
// several rows.
const DUMP = `SET session_replication_role = replica;

-- \\restrict xrav9qmwrnL93bZG8DjRehwOCdAIh5RYkE42Dy0hKDco4iyPyNfroMYlbcp7UNV

SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);

--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."projects" ("id", "name", "created_at", "updated_at") VALUES
\t('01a095bb-633d-774f-aeab-4933ea0ce35e', 'My project', '2026-09-12 13:08:00.955554+00', '2026-09-12 13:08:00.955554+00');

INSERT INTO "public"."items" ("id", "user_id", "name", "created_at", "updated_at", "project_id", "status", "version", "priority", "due_date") VALUES
\t('0191f3c2-1111-7000-8000-aaaaaaaaaaaa', '00000000-0000-7000-8000-000000000001', 'Acheter du pain', '2026-09-12 13:15:15.009+00', '2026-09-12 13:15:15.009+00', '01a095bb-633d-774f-aeab-4933ea0ce35e', 'todo', 1, 'normal', NULL),
\t('0191f3c2-2222-7000-8000-bbbbbbbbbbbb', '00000000-0000-7000-8000-000000000001', 'C''est fait', '2026-09-12 13:15:15.009+00', '2026-09-12 13:15:15.009+00', '01a095bb-633d-774f-aeab-4933ea0ce35e', 'done', 2, 'high', '2026-09-20');
`;

describe('readPostgresDump', () => {
    it('returns every table of the schema, in the order insertions allow', () => {
        const snapshot = readPostgresDump(DUMP);

        expect(snapshot.tables.map(entry => entry.table.name)).toEqual(
            TABLES.map(table => table.name),
        );
    });

    // An empty list and an absent table must not look alike: a target filled
    // from an export that silently skipped a table would look complete.
    it('reports a table the export did not carry as empty, not as missing', () => {
        const snapshot = readPostgresDump(DUMP);
        const outbox = snapshot.tables.find(entry => entry.table.name === 'outbox');

        expect(outbox).toBeDefined();
        expect(outbox?.rows).toEqual([]);
    });

    it('reads the rows of a statement that carries several', () => {
        const items = readPostgresDump(DUMP).tables.find(entry => entry.table.name === 'items');

        expect(items?.rows).toHaveLength(2);
        expect(items?.rows[0]?.get('name')).toBe('Acheter du pain');
        expect(items?.rows[1]?.get('name')).toBe("C'est fait");
    });

    it('keeps a null as a null, and a number as it was written', () => {
        const items = readPostgresDump(DUMP).tables.find(entry => entry.table.name === 'items');

        expect(items?.rows[0]?.get('due_date')).toBeNull();
        expect(items?.rows[1]?.get('due_date')).toBe('2026-09-20');
        expect(items?.rows[1]?.get('version')).toBe('2');
    });

    it('reads a qualified, quoted table name', () => {
        const projects = readPostgresDump(DUMP).tables.find(
            entry => entry.table.name === 'projects',
        );

        expect(projects?.rows[0]?.get('name')).toBe('My project');
    });

    // The auth schema has a users table of its own, with other columns.
    // Reading it as ours would mix two different sets under one name -- and it
    // would look like an export that worked.
    it('reads only the public schema, and not the auth table of the same name', () => {
        const dump = `INSERT INTO "auth"."users" ("id", "encrypted_password") VALUES ('a', 'x');`;

        const users = readPostgresDump(dump).tables.find(entry => entry.table.name === 'users');
        expect(users?.rows).toEqual([]);
    });

    it('skips a table the schema does not describe at all', () => {
        const dump = `INSERT INTO "public"."audit_log" ("id") VALUES ('a');\n${DUMP}`;

        expect(readPostgresDump(dump).tables).toHaveLength(TABLES.length);
    });

    // The model in schema.ts is a copy of the database. A column the export
    // carries and the model does not know means the copy has drifted, and
    // saying so beats writing an export that quietly leaves data behind.
    it('refuses a column the schema does not know, and says the model has drifted', () => {
        const dump = `INSERT INTO "public"."items" ("id", "colour") VALUES ('a', 'red');`;

        expect(() => readPostgresDump(dump)).toThrow(SqlTextError);
        expect(() => readPostgresDump(dump)).toThrow(/no longer matches the database/u);
    });
});
