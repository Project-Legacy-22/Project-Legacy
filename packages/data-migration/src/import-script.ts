import type { LegacyItem } from './legacy-dump.js';
import type { LegacyEngine } from './sql-tokens.js';

// The tag that delimits the generated block. A value holding it would close
// the block early, so a row that contains it is refused rather than written.
const TAG = '$reprise$';
// Mirrors items_name_length_chk. Refusing here rather than letting PostgreSQL
// refuse names the row in a report, instead of aborting the whole transaction.
const MAX_NAME_LENGTH = 255;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export interface ImportTarget {
    source: string;
    engine: LegacyEngine;
    // An address, not an identifier: whoever runs an import knows the former.
    // It is resolved in SQL, and an unknown address cancels the whole import
    // rather than leaving rows nobody owns.
    ownerEmail: string;
    // Supplied rather than derived, and the same one on a second run: that is
    // what makes the script replayable without creating a second project.
    projectId: string;
    projectName: string;
    // Written into the script rather than left to now(), so the artefact means
    // the same thing whenever it is applied. The legacy carries no dates, and
    // inventing one per row would be a lie.
    at: string;
}

export interface RowNote {
    line: number;
    reason: string;
}

export interface ImportReport {
    taken: number;
    refused: RowNote[];
    assumed: RowNote[];
}

interface PreparedRow {
    id: string;
    name: string;
    status: 'todo' | 'done';
}

type Checked = { row: PreparedRow } | { reason: string };

export class ImportTargetError extends Error {
    constructor(reason: string) {
        super(reason);
        this.name = new.target.name;
    }
}

function literal(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
}

function identifierProblem(id: string | null, taken: Set<string>): string | undefined {
    if (id === null) return 'the row carries no identifier';
    if (!UUID.test(id)) return `the identifier \`${id}\` is not a UUID`;
    if (taken.has(id.toLowerCase())) return `the identifier ${id} appears twice in the export`;

    return undefined;
}

function nameProblem(name: string | null): string | undefined {
    if (name === null) return 'the name is null';
    if (name.trim() === '') return 'the name is empty';
    if (name.length > MAX_NAME_LENGTH) {
        return `the name is ${name.length} characters, the column holds ${MAX_NAME_LENGTH}`;
    }
    if (name.includes('\0')) return 'the name holds a null byte, which PostgreSQL text refuses';
    if (name.includes(TAG)) return `the name holds ${TAG}, which delimits the generated block`;

    return undefined;
}

// Nothing is altered to make a row fit: a name is never truncated nor trimmed.
// A row that does not fit is refused and named, because a silently changed task
// is worse than a missing one -- the missing one is in the report.
function prepare(item: LegacyItem, taken: Set<string>): Checked {
    const problem = identifierProblem(item.id, taken) ?? nameProblem(item.name);
    if (problem !== undefined) return { reason: problem };

    // Both checks above guarantee these two.
    const id = (item.id ?? '').toLowerCase();
    const name = item.name ?? '';

    return { row: { id, name, status: item.completed === true ? 'done' : 'todo' } };
}

function header(target: ImportTarget, report: ImportReport): string {
    return `-- Legacy data import, into the PostgreSQL schema of Legacy 22.
--
-- Source          ${target.source} (${target.engine})
-- Generated       ${target.at}
-- Owner           ${target.ownerEmail}
-- Project         ${target.projectName} (${target.projectId})
-- Rows taken      ${report.taken}
-- Rows refused    ${report.refused.length}, named in the report next to this file
--
-- Replayable: every identifier comes from the export and the project one is
-- supplied, so a second application inserts nothing. Priority, due date and
-- version are left to the schema defaults; the legacy carried none of them.
--
-- Transactional: an address no account carries raises, and the transaction
-- rolls back rather than leaving a project nobody owns.`;
}

function itemsInsert(rows: PreparedRow[], target: ImportTarget): string {
    if (rows.length === 0) return '  -- The export carried no row this import could take.';

    const values = rows
        .map(
            row =>
                `    (${literal(row.id)}, v_owner, ${literal(target.projectId)},` +
                ` ${literal(row.name)}, ${literal(row.status)}, ${literal(target.at)},` +
                ` ${literal(target.at)})`,
        )
        .join(',\n');

    return `  insert into public.items
    (id, user_id, project_id, name, status, created_at, updated_at)
  values
${values}
  on conflict (id) do nothing;`;
}

function checkTarget(target: ImportTarget): void {
    if (!UUID.test(target.projectId)) {
        throw new ImportTargetError(`the project identifier \`${target.projectId}\` is not a UUID`);
    }
    const problem = nameProblem(target.projectName);
    if (problem !== undefined) throw new ImportTargetError(`the project name is refused: ${problem}`);
    if (target.ownerEmail.includes("'") || target.ownerEmail.trim() === '') {
        throw new ImportTargetError(`the owner address \`${target.ownerEmail}\` is not an address`);
    }
}

// The script a human reads before anyone applies it. This tool opens no
// connection: a script read before it runs is the only form that leaves a
// chance to refuse an import that got it wrong.
export function buildImportScript(
    items: readonly LegacyItem[],
    target: ImportTarget,
): { sql: string; report: ImportReport } {
    checkTarget(target);

    const rows: PreparedRow[] = [];
    const report: ImportReport = { taken: 0, refused: [], assumed: [] };
    const taken = new Set<string>();

    for (const item of items) {
        const checked = prepare(item, taken);

        if ('reason' in checked) {
            report.refused.push({ line: item.line, reason: checked.reason });
            continue;
        }

        if (item.completed === null) {
            report.assumed.push({ line: item.line, reason: 'completed was null, read as todo' });
        }

        taken.add(checked.row.id);
        rows.push(checked.row);
    }

    report.taken = rows.length;

    return { sql: script(rows, target, report), report };
}

function script(rows: PreparedRow[], target: ImportTarget, report: ImportReport): string {
    return `${header(target, report)}

begin;

-- The artefact means the same thing whoever applies it. In a session where
-- standard_conforming_strings is off, a doubled backslash would read as one
-- and every one of them would be halved, without an error -- and a silently
-- changed task is worse than a missing one, because the missing one is in the
-- report. pg_dump writes the same two lines at the top of its own output.
set standard_conforming_strings = on;
set client_encoding = 'UTF8';

do ${TAG}
declare
  v_owner uuid;
begin
  select id into v_owner from public.users where email = ${literal(target.ownerEmail)};

  if v_owner is null then
    raise exception 'no account carries the address %, the import is cancelled',
      ${literal(target.ownerEmail)};
  end if;

  insert into public.projects (id, name, created_at, updated_at)
  values (${literal(target.projectId)}, ${literal(target.projectName)},
    ${literal(target.at)}, ${literal(target.at)})
  on conflict (id) do nothing;

  insert into public.project_memberships (project_id, user_id, role, created_at)
  values (${literal(target.projectId)}, v_owner, 'owner', ${literal(target.at)})
  on conflict (project_id, user_id) do nothing;

${itemsInsert(rows, target)}
end
${TAG};

commit;
`;
}

export function renderReport(target: ImportTarget, report: ImportReport): string {
    const lines = [
        'Legacy data import report',
        '',
        `Source     ${target.source} (${target.engine})`,
        `Generated  ${target.at}`,
        `Owner      ${target.ownerEmail}`,
        `Project    ${target.projectName} (${target.projectId})`,
        '',
        `Rows taken    ${report.taken}`,
        `Rows refused  ${report.refused.length}`,
        ...report.refused.map(note => `  line ${note.line}: ${note.reason}`),
        '',
        `Assumed  ${report.assumed.length}`,
        ...report.assumed.map(note => `  line ${note.line}: ${note.reason}`),
        '',
    ];

    return lines.join('\n');
}
