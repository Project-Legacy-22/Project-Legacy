import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PROCESSORS } from './policy-processors';

// The guard that keeps the policy honest about who holds what.
//
// The Redis event queue was absent from this table for as long as it existed.
// Nothing could notice: the table is written by hand, and no test related it to
// the code that actually reaches outside. A reader was therefore told about
// four processors while five held something.
//
// So the relation is written down here. Every file of packages/infra that
// reaches a service outside this project is mapped to the row that declares it.
// A new adapter fails this test until someone says which processor it talks to
// -- which is the only moment where anyone still remembers.

const INFRA = join(import.meta.dirname, '..', '..', '..', '..', 'packages', 'infra', 'src');

// Mapped to the beginning of a row's name, not to the whole string: a row may
// carry a parenthesis explaining what the service is, and the mapping should
// not have to be rewritten when that explanation changes.
const DECLARED_BY: Record<string, string> = {
    'adapter.ts': 'Supabase',
    'notification-store.ts': 'Supabase',
    'outbox-store.ts': 'Supabase',
    'supabase-identity-provider.ts': 'Supabase',
    'supabase-item-repository.ts': 'Supabase',
    'supabase-personal-data-store.ts': 'Supabase',
    'supabase-project-repository.ts': 'Supabase',
    // Meme base, meme sous-traitant : les appartenances ont leur propre port
    // parce que project_memberships n a pas de politique de lecture des autres
    // membres, pas parce qu elles sortent ailleurs.
    'supabase-membership-repository.ts': 'Supabase',
    'supabase-invitation-repository.ts': 'Supabase',
    // Same database again: a read of items across the caller's projects
    // (US-20), behind its own port. No new data leaves for anywhere.
    'supabase-attention-reader.ts': 'Supabase',
    'redis-event-bus.ts': 'Event queue',
    'hibp-password-registry.ts': 'Have I Been Pwned',
    'prometheus-metrics.ts': 'Grafana Cloud',
    // pino writes to stdout, and on the deployed target stdout is what Vercel
    // keeps as logs. The destination is a processor even though no client
    // library names it.
    'logger.ts': 'Vercel',
};

function sources(): { file: string; source: string }[] {
    return readdirSync(INFRA)
        .filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'))
        .map(file => ({ file, source: readFileSync(join(INFRA, file), 'utf8') }));
}

// A file reaches outside when it imports a package that is neither the runtime
// nor one of ours, or when it carries an address. Derived rather than listed,
// so a client nobody thought of is still caught -- including one reached by a
// bare URL, which is how Have I Been Pwned is called.
function reachesOutside(source: string): boolean {
    const bare = [...source.matchAll(/from '([^']+)'/gu)]
        .map(match => match[1] ?? '')
        .filter(name => !name.startsWith('node:') && !name.startsWith('@legacy/'))
        .filter(name => !name.startsWith('.'));

    return bare.length > 0 || source.includes('https://');
}

describe('the processors table against the code that reaches outside', () => {
    it('declares a row for every adapter that leaves this project', () => {
        const undeclared = sources()
            .filter(({ source }) => reachesOutside(source))
            .filter(({ file }) => DECLARED_BY[file] === undefined)
            .map(({ file }) => file);

        expect(undeclared).toEqual([]);
    });

    it('maps every adapter onto a row the policy actually carries', () => {
        const names = PROCESSORS.map(processor => processor.name);

        for (const [file, declared] of Object.entries(DECLARED_BY)) {
            expect(
                names.some(name => name.startsWith(declared)),
                `${file} is mapped to \`${declared}\`, which no row declares`,
            ).toBe(true);
        }
    });

    // A mapping that outlives the file it names is worse than none: it says a
    // service is declared while nothing reaches it any more.
    it('maps no file that has been removed', () => {
        const present = new Set(sources().map(({ file }) => file));
        const stale = Object.keys(DECLARED_BY).filter(file => !present.has(file));

        expect(stale).toEqual([]);
    });
});

describe('what each row promises', () => {
    it('gives every row the four fields a reader needs', () => {
        for (const processor of PROCESSORS) {
            expect(processor.name.trim(), 'name').not.toBe('');
            expect(processor.holds.trim(), `${processor.name}: holds`).not.toBe('');
            expect(processor.where.trim(), `${processor.name}: where`).not.toBe('');
            expect(processor.access.trim(), `${processor.name}: access`).not.toBe('');
        }
    });

    // The access is the same everywhere, and the table must not suggest
    // otherwise. It said « the three team members who administer the project »
    // for Vercel, where in fact the six developers all have it: a policy that
    // announces a narrower access than the real one misleads in the direction
    // that matters.
    it('never announces an access narrower than the team', () => {
        const narrower = PROCESSORS.filter(processor =>
            /\bthree\b|\badminister\b|\bone member\b/iu.test(processor.access),
        ).map(processor => processor.name);

        expect(narrower).toEqual([]);
    });

    it('says where each processor holds it', () => {
        for (const processor of PROCESSORS) {
            expect(processor.where, `${processor.name}: where`).toMatch(/[A-Z]/u);
        }
    });
});
