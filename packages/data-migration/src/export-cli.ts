import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argv, stdout } from 'node:process';

import { readAccounts, renderAccounts, withoutPassword } from './accounts.js';
import type { Account } from './accounts.js';
import { fail, options, required } from './cli-options.js';
import { readPostgresDump } from './postgres-dump.js';
import { renderData } from './render-data.js';
import { renderSchema } from './render-schema.js';
import type { Dialect } from './render-schema.js';

const DIALECTS: readonly Dialect[] = ['postgres', 'mysql', 'sqlite'];

const USAGE = `npm run data:export -- --from <dump.sql> [--out <directory>]

Turns a PostgreSQL data dump of ours into a schema, a data and an accounts
file for each of postgres, mysql and sqlite. Produce the dump with:

  npx supabase db dump --local --data-only -s public,auth -f data-out/dump.sql

Without the auth schema, no accounts file is written. Applies nothing, and
reaches no database. See docs/data-migration.md.`;

// What the accounts part of the run says: how many crossed, and how many will
// have to reset a password, which the person applying the files must know.
function accountsNote(accounts: readonly Account[]): string {
    if (accounts.length === 0) {
        return 'No account in the dump: it was taken without -s auth, and no accounts\n' +
            'file was written. Every person will have to sign up again on the target.\n';
    }

    const missing = withoutPassword(accounts);
    return `accounts ${accounts.length}, ${missing} without a password (to reset on the target)\n` +
        'The accounts files hold password hashes: keep them out of any repository.\n';
}

function run(args: readonly string[]): void {
    const found = options(args);
    const from = required(found, 'from');
    const out = found.get('out') ?? 'data-out';
    const dump = readFileSync(from, 'utf8');
    const snapshot = readPostgresDump(dump);
    const accounts = readAccounts(dump);

    mkdirSync(out, { recursive: true });
    const written: string[] = [];

    for (const dialect of DIALECTS) {
        const schema = join(out, `${dialect}-schema.sql`);
        const data = join(out, `${dialect}-data.sql`);

        writeFileSync(schema, renderSchema(dialect), 'utf8');
        writeFileSync(data, renderData(snapshot, dialect), 'utf8');
        written.push(schema, data);

        if (accounts.length > 0) {
            const file = join(out, `${dialect}-accounts.sql`);
            writeFileSync(file, renderAccounts(accounts, dialect), 'utf8');
            written.push(file);
        }
    }

    const counted = snapshot.tables
        .map(({ table, rows }) => `${table.name} ${rows.length}`)
        .join(', ');

    stdout.write(
        `${counted}\n${accountsNote(accounts)}\n${written.map(path => `  ${path}`).join('\n')}\n\n` +
            'Apply the schema, then the data, then the accounts. Nothing has touched\n' +
            'a database.\n',
    );
}

try {
    run(argv.slice(2));
} catch (cause) {
    fail(cause, USAGE);
}
