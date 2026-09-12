import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argv, exit, stderr, stdout } from 'node:process';

import { readPostgresDump } from './postgres-dump.js';
import { renderData } from './render-data.js';
import { renderSchema } from './render-schema.js';
import type { Dialect } from './render-schema.js';

const DIALECTS: readonly Dialect[] = ['postgres', 'mysql', 'sqlite'];

const USAGE = `npm run data:export -- --from <dump.sql> [--out <directory>]

Turns a PostgreSQL data dump of ours into a schema and a data file for each of
postgres, mysql and sqlite. Produce the dump with:

  npx supabase db dump --local --data-only -s public -f dump.sql

Applies nothing, and reaches no database. See docs/data-migration.md.`;

function options(args: readonly string[]): Map<string, string> {
    const found = new Map<string, string>();

    for (let at = 0; at < args.length; at += 2) {
        const name = args[at] ?? '';
        const value = args[at + 1];

        if (!name.startsWith('--')) throw new Error(`\`${name}\` is not an option`);
        if (value === undefined) throw new Error(`\`${name}\` carries no value`);

        found.set(name.slice(2), value);
    }

    return found;
}

function run(args: readonly string[]): void {
    const found = options(args);
    const from = found.get('from');
    if (from === undefined || from === '') throw new Error('--from is missing');

    const out = found.get('out') ?? 'data-out';
    const snapshot = readPostgresDump(readFileSync(from, 'utf8'));

    mkdirSync(out, { recursive: true });
    const written: string[] = [];

    for (const dialect of DIALECTS) {
        const schema = join(out, `${dialect}-schema.sql`);
        const data = join(out, `${dialect}-data.sql`);

        writeFileSync(schema, renderSchema(dialect), 'utf8');
        writeFileSync(data, renderData(snapshot, dialect), 'utf8');
        written.push(schema, data);
    }

    const counted = snapshot.tables
        .map(({ table, rows }) => `${table.name} ${rows.length}`)
        .join(', ');

    stdout.write(
        `${counted}\n\n${written.map(path => `  ${path}`).join('\n')}\n\n` +
            'Apply the schema first, then the data. Nothing has touched a database,\n' +
            'and no account came with it: they belong to GoTrue.\n',
    );
}

try {
    run(argv.slice(2));
} catch (cause) {
    stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n\n${USAGE}\n`);
    exit(1);
}
