import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argv, stdout } from 'node:process';

import { fail, options, required } from './cli-options.js';
import { buildImportScript, renderReport } from './import-script.js';
import type { ImportTarget } from './import-script.js';
import { readLegacyDump } from './legacy-dump.js';
import type { LegacyEngine } from './sql-tokens.js';

const USAGE = `npm run data:import -- --from <export.sql> --engine mysql|sqlite \\
  --owner <address> --project-id <uuid> --project <name> [--out <directory>]

Reads a legacy export and writes a SQL import script plus its report. Applies
nothing: read the script, then apply it yourself. See docs/data-migration.md.`;

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
    fail(cause, USAGE);
}
