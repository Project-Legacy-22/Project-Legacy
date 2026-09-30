import { beforeAll, describe, expect, it } from 'vitest';

import { readAccounts, renderAccounts } from '../../packages/data-migration/src/accounts.js';
import { readPostgresDump } from '../../packages/data-migration/src/postgres-dump.js';
import { renderData } from '../../packages/data-migration/src/render-data.js';
import { renderSchema } from '../../packages/data-migration/src/render-schema.js';
import {
    mysqlAdmin,
    mysqlAsk,
    mysqlRun,
    postgresAdmin,
    postgresAsk,
    postgresDump,
    postgresRun,
    sqliteAsk,
    sqliteReset,
    sqliteRun,
} from './containers.js';

// Leaving Supabase with the accounts (#426): the hash that arrives in each
// target must still say yes to the original password, and no to another.
//
// A plain PostgreSQL has no GoTrue, so the source of auth.users is written
// here, in the shape `supabase db dump` gives it, around a hash that pgcrypto
// computes the way GoTrue does: bcrypt, cost 10. The same crypt() then checks
// the hash read back from each target -- MySQL and SQLite cannot, and an
// application on them would use a bcrypt library for exactly that comparison.

const SOURCE = 'legacy22_comptes';
const PASSWORD = "Mot de passe d'origine 2026";
const CAMILLE = '0000de00-0000-7000-8000-000000000001';
const HUGO = '0000de00-0000-7000-8000-000000000002';

let hash = '';
let data = { postgres: '', mysql: '', sqlite: '' };
let accounts = { postgres: '', mysql: '', sqlite: '' };

// Does this hash accept this password? Asked of pgcrypto, whatever engine the
// hash was read back from.
function accepts(candidate: string, password: string): boolean {
    const quoted = password.replaceAll("'", "''");
    return postgresAsk(SOURCE, `select crypt('${quoted}', '${candidate}') = '${candidate}'`) === 't';
}

beforeAll(() => {
    postgresAdmin(`drop database if exists ${SOURCE}`);
    postgresAdmin(`create database ${SOURCE}`);
    postgresRun(SOURCE, renderSchema('postgres'));
    postgresRun(SOURCE, 'create extension if not exists pgcrypto;');
    postgresRun(
        SOURCE,
        `insert into "users" ("id", "email") values
           ('${CAMILLE}', 'camille@example.com'), ('${HUGO}', 'hugo@example.com');`,
    );

    hash = postgresAsk(SOURCE, `select crypt('${PASSWORD.replaceAll("'", "''")}', gen_salt('bf', 10))`);
    // Before the dump and not after: pg_dump ends on `\unrestrict <key>`, a
    // psql command with no semicolon, which would swallow a statement placed
    // after it. `supabase db dump` writes that line as a comment.
    const dump = `INSERT INTO "auth"."users" ("instance_id", "id", "email", "encrypted_password", "email_confirmed_at", "created_at") VALUES
\t('00000000-0000-0000-0000-000000000000', '${CAMILLE}', 'camille@example.com', '${hash}', '2026-09-24 13:18:23.519012+00', '2026-09-24 13:18:23.519012+00'),
\t('00000000-0000-0000-0000-000000000000', '${HUGO}', 'hugo@example.com', '', NULL, '2026-09-24 13:18:23.519012+00');

${postgresDump(SOURCE)}`;

    const snapshot = readPostgresDump(dump);
    const read = readAccounts(dump);
    data = {
        postgres: renderData(snapshot, 'postgres'),
        mysql: renderData(snapshot, 'mysql'),
        sqlite: renderData(snapshot, 'sqlite'),
    };
    accounts = {
        postgres: renderAccounts(read, 'postgres'),
        mysql: renderAccounts(read, 'mysql'),
        sqlite: renderAccounts(read, 'sqlite'),
    };
});

describe('accounts leaving for a PostgreSQL', () => {
    const TARGET = 'legacy22_comptes_ailleurs';

    it('arrive with their hash intact, which still accepts the original password', () => {
        postgresAdmin(`drop database if exists ${TARGET}`);
        postgresAdmin(`create database ${TARGET}`);
        postgresRun(TARGET, renderSchema('postgres'));
        postgresRun(TARGET, data.postgres);
        postgresRun(TARGET, accounts.postgres);

        const arrived = postgresAsk(TARGET, `select "password_hash" from "accounts" where "id" = '${CAMILLE}'`);

        expect(arrived).toBe(hash);
        expect(accepts(arrived, PASSWORD)).toBe(true);
        expect(accepts(arrived, 'un autre mot de passe')).toBe(false);
    });

    it('arrive without a password when the account had none', () => {
        expect(postgresAsk(TARGET, `select "password_hash" is null from "accounts" where "id" = '${HUGO}'`)).toBe('t');
    });

    it('are all refused when the target already holds one of the addresses', () => {
        expect(() => postgresRun(TARGET, accounts.postgres)).toThrow(/duplicate key/u);
        expect(postgresAsk(TARGET, 'select count(*) from "accounts"')).toBe('2');
    });
});

describe('accounts leaving for a MySQL', () => {
    const TARGET = 'legacy22_comptes';

    it('arrive with their hash intact, which still accepts the original password', () => {
        mysqlAdmin(`drop database if exists ${TARGET}`);
        mysqlAdmin(`create database ${TARGET}`);
        mysqlRun(TARGET, renderSchema('mysql'));
        mysqlRun(TARGET, data.mysql);
        mysqlRun(TARGET, accounts.mysql);

        const arrived = mysqlAsk(TARGET, `select password_hash from accounts where id = '${CAMILLE}'`);

        expect(arrived).toBe(hash);
        expect(accepts(arrived, PASSWORD)).toBe(true);
    });

    it('are all refused when the target already holds one of the addresses', () => {
        expect(() => mysqlRun(TARGET, accounts.mysql)).toThrow(/Duplicate entry/u);
        expect(mysqlAsk(TARGET, 'select count(*) from accounts')).toBe('2');
    });
});

describe('accounts leaving for a SQLite', () => {
    it('arrive with their hash intact, which still accepts the original password', () => {
        sqliteReset();
        sqliteRun(renderSchema('sqlite'));
        sqliteRun(data.sqlite);
        sqliteRun(accounts.sqlite);

        const arrived = sqliteAsk(`select password_hash from accounts where id = '${CAMILLE}'`);

        expect(arrived).toBe(hash);
        expect(accepts(arrived, PASSWORD)).toBe(true);
    });

    it('are all refused when the target already holds one of the addresses', () => {
        expect(() => sqliteRun(accounts.sqlite)).toThrow(/UNIQUE constraint failed/u);
        expect(sqliteAsk('select count(*) from accounts')).toBe('2');
    });
});
