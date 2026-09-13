// One command takes the backup Supabase does not take for us.
//
// A project on the free plan receives no automated backup: Supabase itself
// recommends exporting with `db dump` and keeping the result off-site, and
// docs/backup-and-exit.md quotes the sentence. This is therefore not a
// precaution, it is the only backup that exists.
//
// Three files, which is the triple a Supabase restore expects: the cluster
// roles, the schema, then the data. Restoring them out of that order fails --
// data before schema has nowhere to go.
//
// What it produces carries accounts and their password hashes, because the
// data dump includes the `auth` schema. It is written outside the tracked
// files, and .gitignore covers the directory.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PARTS = [
    { file: 'roles.sql', flags: ['--role-only'], what: 'the cluster roles' },
    { file: 'schema.sql', flags: [], what: 'the schema' },
    { file: 'data.sql', flags: ['--data-only'], what: 'the data, auth schema included' },
];

const USAGE = `npm run backup [-- --local]

With no argument, backs up the linked project -- the one \`supabase link\`
remembers. The CLI then asks for the database password, or reads
SUPABASE_DB_PASSWORD. With --local, backs up the local stack.

See docs/backup-and-exit.md for the restore.`;

function version() {
    return execFileSync('npx', ['supabase', '--version'], { encoding: 'utf8' }).trim();
}

function digest(path) {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function takeBackup(target, directory) {
    const lines = [];

    for (const part of PARTS) {
        const path = join(directory, part.file);
        // Inherited stdio, so the CLI's password prompt reaches whoever ran
        // the command rather than a buffer nobody reads.
        execFileSync('npx', ['supabase', 'db', 'dump', `--${target}`, ...part.flags, '-f', path], {
            stdio: 'inherit',
        });

        const size = statSync(path).size;
        lines.push(`${part.file}  ${size} bytes  sha256:${digest(path)}`);
        process.stdout.write(`  ${part.file}: ${part.what}, ${size} bytes\n`);
    }

    return lines;
}

// What it takes to know, later, what these files are and whether anything
// damaged them. Without it, a directory of three .sql files says neither where
// it came from nor whether it is whole.
function writeManifest(target, directory, lines) {
    const content = [
        'Legacy 22 backup',
        '',
        `Taken        ${new Date().toISOString()}`,
        `Target       ${target}`,
        `Supabase CLI ${version()}`,
        '',
        'Files, in the order they restore in:',
        ...lines.map(line => `  ${line}`),
        '',
        'Restore: docs/backup-and-exit.md',
        '',
    ].join('\n');

    writeFileSync(join(directory, 'MANIFEST.txt'), content, 'utf8');
}

const args = process.argv.slice(2);
const unknown = args.find(arg => arg !== '--local');

if (unknown !== undefined) {
    process.stderr.write(`\`${unknown}\` is not an option\n\n${USAGE}\n`);
    process.exit(1);
}

const target = args.includes('--local') ? 'local' : 'linked';
// The timestamp is the name: two backups never overwrite each other, and
// alphabetical order is chronological order.
const directory = join('backups', new Date().toISOString().replaceAll(/[:.]/gu, '-'));

mkdirSync(directory, { recursive: true });
process.stdout.write(`Backing up ${target} into ${directory}\n`);

try {
    writeManifest(target, directory, takeBackup(target, directory));
} catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    process.stderr.write(`\nThe backup failed: ${reason}\n`);
    process.stderr.write(`${directory} is incomplete. Do not restore from it.\n`);
    process.exit(1);
}

process.stdout.write(
    `\nThree files and a manifest in ${directory}.\n` +
        'This directory carries accounts and their password hashes: keep it out of\n' +
        'the repository, and off this machine if the backup matters.\n',
);
