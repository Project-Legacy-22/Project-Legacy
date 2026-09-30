import { describe, expect, it } from 'vitest';

import { readAccounts, renderAccounts, withoutPassword } from './accounts.js';
import { readPostgresDump } from './postgres-dump.js';
import { renderData } from './render-data.js';
import type { Dialect } from './render-schema.js';
import { SqlTextError } from './sql-tokens.js';

const DIALECTS: readonly Dialect[] = ['postgres', 'mysql', 'sqlite'];
const HASH = '$2a$10$dzl3B1WvCeIasKamYRpsmeTP23i8KODcwrWMnmN4j.SupCO0Jg.ci';

// What `supabase db dump --data-only -s public,auth` writes, cut down: GoTrue's
// users with more columns than we keep, a table of GoTrue's that carries a
// secret we must not take, and our own users table under the same name.
const DUMP = `SET session_replication_role = replica;

INSERT INTO "auth"."users" ("instance_id", "id", "aud", "email", "encrypted_password", "email_confirmed_at", "raw_app_meta_data", "created_at") VALUES
\t('00000000-0000-0000-0000-000000000000', '0000de00-0000-7000-8000-000000000001', 'authenticated', 'camille.demo@example.com', '${HASH}', '2026-09-24 13:18:23.519012+00', '{"provider": "email"}', '2026-09-24 13:18:23.519012+00'),
\t('00000000-0000-0000-0000-000000000000', '0000de00-0000-7000-8000-000000000002', 'authenticated', 'hugo.demo@example.com', '', NULL, '{}', '2026-09-24 13:18:23.519012+00');

INSERT INTO "auth"."refresh_tokens" ("instance_id", "id", "token", "user_id") VALUES
\t('00000000-0000-0000-0000-000000000000', 1, 'a-refresh-token', '0000de00-0000-7000-8000-000000000001');

INSERT INTO "public"."users" ("id", "email", "created_at", "updated_at", "policy_version", "policy_accepted_at") VALUES
\t('0000de00-0000-7000-8000-000000000001', 'camille.demo@example.com', '2026-09-24 13:18:23+00', '2026-09-24 13:18:23+00', NULL, NULL);
`;

describe('readAccounts', () => {
    it('reads each account of auth.users, and only what signing in needs', () => {
        const [camille] = readAccounts(DUMP);

        expect(camille && Object.fromEntries(camille)).toEqual({
            id: '0000de00-0000-7000-8000-000000000001',
            email: 'camille.demo@example.com',
            password_hash: HASH,
            email_confirmed_at: '2026-09-24 13:18:23.519012+00',
            created_at: '2026-09-24 13:18:23.519012+00',
        });
    });

    it('reads the empty password GoTrue writes as no password, and counts it', () => {
        const accounts = readAccounts(DUMP);

        expect(accounts[1]?.get('password_hash')).toBeNull();
        expect(withoutPassword(accounts)).toBe(1);
    });

    it('takes nothing from the other tables of the auth schema, nor from ours', () => {
        const accounts = readAccounts(DUMP);

        expect(accounts).toHaveLength(2);
        expect(JSON.stringify(accounts.map(entry => [...entry]))).not.toContain('a-refresh-token');
    });

    it('reads nothing from a dump taken without the auth schema', () => {
        expect(readAccounts('INSERT INTO "public"."projects" ("id") VALUES (\'a\');')).toEqual([]);
    });

    it('refuses an account without an address, and names it', () => {
        const dump = `INSERT INTO "auth"."users" ("id", "email") VALUES ('0000de00-0000-7000-8000-000000000003', NULL);`;

        expect(() => readAccounts(dump)).toThrow(SqlTextError);
        expect(() => readAccounts(dump)).toThrow(/0000de00-0000-7000-8000-000000000003 has no email/u);
    });
});

describe('renderAccounts', () => {
    it.each(DIALECTS)('writes the hash exactly as GoTrue did for %s', dialect => {
        expect(renderAccounts(readAccounts(DUMP), dialect)).toContain(`'${HASH}'`);
    });

    it.each(DIALECTS)('ties each account to its user, and keeps an address unique for %s', dialect => {
        const sql = renderAccounts(readAccounts(DUMP), dialect);

        expect(sql).toMatch(/create table if not exists .accounts. \(/u);
        expect(sql).toMatch(/foreign key \(.id.\) references .users. \(.id.\)/u);
        expect(sql).toMatch(/unique \(.email.\)/u);
    });

    // One insert for every account: a target that already holds one of the
    // addresses refuses the statement, and none is written.
    it('writes every account in a single statement inside one transaction', () => {
        const sql = renderAccounts(readAccounts(DUMP), 'mysql');

        expect(sql.match(/insert into/gu)).toHaveLength(1);
        expect(sql).toMatch(/begin;[\s\S]*insert into[\s\S]*commit;/u);
    });

    it('says in the file that it holds password hashes, and in which format', () => {
        const sql = renderAccounts(readAccounts(DUMP), 'sqlite');

        expect(sql).toContain('This file holds password hashes');
        expect(sql).toContain('bcrypt');
    });

    it('refuses to write an accounts file with no account in it', () => {
        expect(() => renderAccounts([], 'postgres')).toThrow(/no row of auth.users/u);
    });

    it.each(DIALECTS)('leaves the hashes out of the data file for %s', dialect => {
        const data = renderData(readPostgresDump(DUMP), dialect);

        expect(data).toContain('camille.demo@example.com');
        expect(data).not.toContain(HASH);
    });
});
