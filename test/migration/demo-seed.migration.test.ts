import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { postgresAdmin, postgresAsk, postgresRun } from './containers.js';

// supabase/seed.sql creates accounts whose password is in the README. The one
// thing it must never do is run anywhere but the local Supabase stack, and the
// only way to prove that is to hand it a database that is not one. The plain
// PostgreSQL of the migration profile is exactly that: it knows nothing of the
// JWT secret the local stack runs on, as a hosted project would not either.

const DATABASE = 'demo_seed';
const SEED = readFileSync(new URL('../../supabase/seed.sql', import.meta.url), 'utf8');

describe('the demonstration seed', () => {
    beforeAll(() => {
        postgresAdmin(`drop database if exists ${DATABASE}`);
        postgresAdmin(`create database ${DATABASE}`);
    });

    it('refuses a database that is not the local Supabase stack', () => {
        expect(() => postgresRun(DATABASE, SEED)).toThrow(
            /supabase\/seed\.sql only runs on the local Supabase stack/,
        );
    });

    it('stops before writing anything', () => {
        // A table created by a statement placed above the guard by mistake
        // would show up here.
        expect(() => postgresRun(DATABASE, SEED)).toThrow();
        expect(postgresAsk(DATABASE, "select count(*) from pg_tables where schemaname = 'public'")).toBe('0');
    });
});
