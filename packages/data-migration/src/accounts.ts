import { readRow } from './postgres-dump.js';
import type { Cell } from './postgres-dump.js';
import { ExportError, insertFor } from './render-data.js';
import { createTable } from './render-schema.js';
import type { Dialect } from './render-schema.js';
import type { Table } from './schema.js';
import { SqlTextError, tokenise } from './sql-tokens.js';
import {
    expect,
    insertedName,
    peek,
    reader,
    skipInsertInto,
    skipStatement,
    take,
} from './statement-reader.js';
import type { Reader } from './statement-reader.js';

// The accounts, out of GoTrue, for a target that has no GoTrue (#426).
//
// Leaving Supabase used to leave every account behind: the data export read
// `public` only, and the password hashes live in `auth.users`. A dump taken
// with `-s public,auth` carries them, as bcrypt (`$2a$...`), a format any
// bcrypt library reads. What crosses is what signing in needs: the identifier
// (which is `users.id`, so an account finds its tasks again), the address, the
// hash, and whether the address was confirmed. Sessions, refresh tokens and the
// audit log stay behind: they mean something to GoTrue only.
//
// Not part of TABLES: `accounts` is not in our schema, and the guard against
// information_schema would rightly refuse it there.

export const ACCOUNTS: Table = {
    name: 'accounts',
    columns: [
        { name: 'id', kind: 'uuid', nullable: false },
        { name: 'email', kind: 'text', nullable: false },
        // Null for an account that never set a password: it crosses anyway,
        // and signs in once the password is reset on the target.
        { name: 'password_hash', kind: 'text', nullable: true },
        { name: 'email_confirmed_at', kind: 'timestamp', nullable: true },
        { name: 'created_at', kind: 'timestamp', nullable: false, default: 'now' },
    ],
    primaryKey: ['id'],
    references: [{ column: 'id', table: 'users', target: 'id' }],
    unique: [['email']],
};

export type Account = ReadonlyMap<string, Cell>;

// GoTrue's name for each column we keep. The hash is renamed: on a target it
// is no longer "encrypted" by anybody, it is a bcrypt hash, and saying so is
// what tells the next implementer which library reads it.
const SOURCE: Record<string, string> = {
    id: 'id',
    email: 'email',
    password_hash: 'encrypted_password',
    email_confirmed_at: 'email_confirmed_at',
    created_at: 'created_at',
};

function readNames(input: Reader): readonly string[] {
    expect(input, '(');
    const names: string[] = [];

    for (;;) {
        const token = take(input);
        if (token.value === ')') return names;
        if (token.value !== ',') names.push(token.value.toLowerCase());
    }
}

function account(row: ReadonlyMap<string, Cell>, line: number): Account {
    const email = row.get('email');
    // An account without an address cannot sign in anywhere, and the target
    // refuses a null in a column it keys: better named here, with its line.
    if (typeof email !== 'string' || email === '') {
        throw new SqlTextError(line, `the account ${String(row.get('id'))} has no email address`);
    }

    const picked = new Map<string, Cell>();
    for (const [ours, theirs] of Object.entries(SOURCE)) picked.set(ours, row.get(theirs) ?? null);
    // GoTrue writes an empty string, not a null, when there is no password.
    if (picked.get('password_hash') === '') picked.set('password_hash', null);

    return picked;
}

function isAuthUsers(parts: readonly string[] | undefined): boolean {
    return parts?.length === 2 && parts[0] === 'auth' && parts[1] === 'users';
}

// Every row of `auth.users` in the dump, and nothing else of it.
export function readAccounts(dump: string): readonly Account[] {
    const input = reader(tokenise(dump, 'postgres'));
    const accounts: Account[] = [];

    while (input.at < input.tokens.length) {
        if (!isAuthUsers(insertedName(input))) {
            skipStatement(input);
            continue;
        }

        skipInsertInto(input);
        const names = readNames(input);
        expect(input, 'values');

        for (;;) {
            const line = peek(input)?.line ?? 0;
            accounts.push(account(readRow(input, names), line));
            if (peek(input)?.value !== ',') break;
            take(input);
        }

        skipStatement(input);
    }

    return accounts;
}

export function withoutPassword(accounts: readonly Account[]): number {
    return accounts.filter(entry => entry.get('password_hash') === null).length;
}

// The table and its rows, for one target. Applied after `<target>-data.sql`:
// each account points at its row in `users`.
//
// The table is created only if missing, and the rows go in one statement: an
// address the target already holds fails that statement, and no account is
// written rather than some of them.
export function renderAccounts(accounts: readonly Account[], dialect: Dialect): string {
    if (accounts.length === 0) throw new ExportError('the dump carries no row of auth.users');

    const header = [
        `-- Legacy 22 accounts, rendered for ${dialect}. Apply after ${dialect}-data.sql.`,
        '--',
        '-- This file holds password hashes. Keep it out of any repository, and',
        '-- delete it once applied. password_hash is bcrypt, as GoTrue wrote it:',
        '-- a bcrypt library compares a password with it, nothing decrypts it.',
        '',
    ];

    return [
        ...header,
        createTable(ACCOUNTS, dialect).replace('create table ', 'create table if not exists '),
        '',
        'begin;',
        '',
        ...insertFor(ACCOUNTS, accounts, dialect),
        '',
        'commit;',
        '',
    ].join('\n');
}
