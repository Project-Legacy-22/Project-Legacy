import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argv, exit, stderr, stdout } from 'node:process';

import { buildImportScript, renderReport } from './import-script.js';
import type { ImportTarget } from './import-script.js';
import { readLegacyDump } from './legacy-dump.js';
import type { LegacyEngine } from './sql-tokens.js';

const USAGE = `npm run data:import -- --from <export.sql> --engine mysql|sqlite \\
  --owner <address> --project-id <uuid> --project <name> [--out <directory>]

Reads a legacy export and writes a SQL import script plus its report. Applies
nothing: read the script, then apply it yourself. See docs/data-migration.md.`;

// Written by hand rather than pulled from a package: this tool declares no
// dependency, because it has to work the day the application does not.
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

function required(found: Map<string, string>, name: string): string {
    const value = found.get(name);
    if (value === undefined || value === '') throw new Error(`--${name} is missing`);

    return value;
}

function engineOf(value: string): LegacyEngine {
    if (value === 'mysql' || value === 'sqlite') return value;
    throw new Error(`--engine is \`${value}\`, expected mysql or sqlite`);
}

function targetOf(found: Map<string, string>, source: string): ImportTarget {
    return {
        source,
        engine: engineOf(required(found, 'engine')),
        ownerEmail: required(found, 'owner'),
        projectId: required(found, 'project-id'),
        projectName: required(found, 'project'),
        // One timestamp for the whole run, written into the artefact, so
        // applying it tomorrow means what it meant today.
        at: new Date().toISOString(),
    };
}

function run(args: readonly string[]): void {
    const found = options(args);
    const from = required(found, 'from');
    const out = found.get('out') ?? 'data-out';

    const target = targetOf(found, from);
    const items = readLegacyDump(readFileSync(from, 'utf8'), target.engine);
    const { sql, report } = buildImportScript(items, target);

    const stamp = target.at.replaceAll(/[:.]/gu, '-');
    const script = join(out, `import-${stamp}.sql`);
    const notes = join(out, `import-${stamp}.report.txt`);

    mkdirSync(out, { recursive: true });
    writeFileSync(script, sql, 'utf8');
    writeFileSync(notes, renderReport(target, report), 'utf8');

    stdout.write(
        `${items.length} rows read, ${report.taken} taken, ${report.refused.length} refused.\n` +
            `script  ${script}\nreport  ${notes}\n\n` +
            'Read the script before applying it. Nothing has touched a database.\n',
    );
}

try {
    run(argv.slice(2));
} catch (cause) {
    stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n\n${USAGE}\n`);
    exit(1);
}
