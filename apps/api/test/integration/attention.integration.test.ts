import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '../../../../packages/infra/src/database.types.js';

import { json } from '../http-harness.js';
import type { Harness } from '../http-harness.js';
import { integrationConfig, realApplication, registerAndSignIn, serveAs } from './support.js';
import type { RealAccount } from './support.js';

// What the in-memory reader cannot prove: that the adapter's joins scope the
// read to the caller's memberships, and that its filters say what
// attentionGroupOf says. The adapter is excluded from the coverage gate like
// its Supabase siblings; this suite is where it is verified.
const MOT_DE_PASSE = 'IntegrationTest2026';
const TODAY = '2026-09-23';
const ATTENTION = `/projects/attention?today=${TODAY}`;

interface AttentionBody {
    overdue: { items: { name: string; projectName: string }[] };
    dueSoon: { items: { name: string }[] };
    highPriority: { items: { name: string; projectName: string }[] };
    workload: string;
}

function namesIn(body: AttentionBody): string[][] {
    return [body.overdue.items, body.dueSoon.items, body.highPriority.items].map((items) =>
        items.map((item) => item.name),
    );
}

interface Person {
    account: RealAccount;
    as: Harness;
}

describe('attention API (integration)', () => {
    let app: ReturnType<typeof realApplication>;
    const harnesses: Harness[] = [];

    // A fresh account per person and per test: each test reads the whole of
    // what its people can see, so none may depend on what another one wrote.
    async function aPerson(): Promise<Person> {
        const account = await registerAndSignIn(app, MOT_DE_PASSE);
        const as = await serveAs(app, account.cookie);
        harnesses.push(as);
        return { account, as };
    }

    async function add(person: Person, body: Record<string, unknown>): Promise<{ id: string; version: number }> {
        const response = await person.as.request(`/projects/${person.account.projectId}/items`, json('POST', body));
        expect(response.status).toBe(200);
        return (await response.json()) as { id: string; version: number };
    }

    async function attentionOf(person: Person): Promise<AttentionBody> {
        const response = await person.as.request(ATTENTION);
        expect(response.status).toBe(200);
        return (await response.json()) as AttentionBody;
    }

    // Not started: this suite reads and writes items, it relays nothing, and
    // start() would demand a broker for the relay it launches.
    beforeAll(() => {
        app = realApplication();
    });

    afterEach(async () => {
        await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
    });

    it('dit qu un compte neuf n a encore rien', async () => {
        const ada = await aPerson();

        await expect(attentionOf(ada)).resolves.toMatchObject({ workload: 'none' });
    });

    it('classe les taches ouvertes par groupe, sans les terminees ni les lointaines', async () => {
        const ada = await aPerson();
        await add(ada, { name: 'hier', dueDate: '2026-09-22' });
        await add(ada, { name: 'aujourd hui', dueDate: TODAY });
        await add(ada, { name: 'demain', dueDate: '2026-09-24', priority: 'high' });
        await add(ada, { name: 'prioritaire', priority: 'high' });
        await add(ada, { name: 'plus tard', dueDate: '2026-10-15' });
        const done = await add(ada, { name: 'terminee', dueDate: '2026-09-01', priority: 'high' });
        const moved = await ada.as.request(
            `/projects/${ada.account.projectId}/items/${done.id}/status`,
            json('PATCH', { status: 'done', version: done.version }),
        );
        expect(moved.status).toBe(200);

        const body = await attentionOf(ada);

        expect(namesIn(body)).toEqual([['hier'], ['aujourd hui', 'demain'], ['prioritaire']]);
        expect(body.workload).toBe('open');
    });

    it('dit que tout est termine quand la seule tache l est', async () => {
        const ada = await aPerson();
        const done = await add(ada, { name: 'terminee', dueDate: '2026-09-01' });
        await ada.as.request(
            `/projects/${ada.account.projectId}/items/${done.id}/status`,
            json('PATCH', { status: 'done', version: done.version }),
        );

        await expect(attentionOf(ada)).resolves.toMatchObject({ workload: 'all_done' });
    });

    it('ne montre a une personne aucune tache d un projet dont elle n est pas membre', async () => {
        const [ada, alan] = await Promise.all([aPerson(), aPerson()]);
        await add(ada, { name: 'celle d ada', dueDate: '2026-09-01' });
        await add(alan, { name: 'celle d alan', dueDate: '2026-09-01' });

        const [adaSees, alanSees] = await Promise.all([attentionOf(ada), attentionOf(alan)]);

        expect([namesIn(adaSees), namesIn(alanSees)]).toEqual([
            [['celle d ada'], [], []],
            [['celle d alan'], [], []],
        ]);
    });

    it('montre les taches d un projet partage, avec le nom de ce projet', async () => {
        const [ada, alan] = await Promise.all([aPerson(), aPerson()]);
        await add(alan, { name: 'celle d alan', dueDate: '2026-09-01' });
        const config = integrationConfig();
        const database = createClient<Database>(config.supabaseUrl, config.supabaseServiceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const joined = await database
            .from('project_memberships')
            .insert({ project_id: alan.account.projectId, user_id: ada.account.id, role: 'member' });
        expect(joined.error).toBeNull();
        const project = await database.from('projects').select('name').eq('id', alan.account.projectId).single();
        expect(project.error).toBeNull();

        const body = await attentionOf(ada);

        expect(body.overdue.items).toEqual([
            expect.objectContaining({ name: 'celle d alan', projectName: project.data?.name }),
        ]);
    });
});
