import { beforeAll, describe, expect, it } from 'vitest';

import { ProjectNotFound } from '@legacy/core-projects';

import type { Application } from '../../src/composition-root.js';
import { realApplication, registerAndSignIn } from './support.js';
import type { RealAccount } from './support.js';

// What the in-memory double cannot prove: that the join reaches users and
// brings back the address.
//
// The adapter is excluded from the coverage gate like its six Supabase
// siblings -- it cannot be exercised without a real PostgREST -- so this is
// where it is actually verified. A hand-written double of a query builder
// would have agreed with whatever the adapter wrote.
const MOT_DE_PASSE = 'IntegrationTest2026';

let app: Application;
let ada: RealAccount;

beforeAll(async () => {
    app = realApplication();
    // L inscription cree le projet par defaut et son appartenance owner : rien
    // a poser a la main, c est le chemin que l application emprunte vraiment.
    ada = await registerAndSignIn(app, MOT_DE_PASSE);
});

describe('the members of a project, against the real database', () => {
    it('brings back the address from the join, not just the identifier', async () => {
        const members = await app.useCases.projects.listProjectMembers(ada.projectId, ada.id);

        expect(members).toEqual([{ userId: ada.id, email: ada.email, role: 'owner' }]);
    });

    // La posture qui compte : un 404 et non un 403, pour ne pas confirmer
    // l existence du projet a qui devine des identifiants.
    it('answers a stranger like a project that does not exist', async () => {
        const alan = await registerAndSignIn(app, MOT_DE_PASSE);

        await expect(
            app.useCases.projects.listProjectMembers(ada.projectId, alan.id),
        ).rejects.toThrow(ProjectNotFound);
    });

    it('answers the same way for a project nobody has', async () => {
        await expect(
            app.useCases.projects.listProjectMembers(
                '00000000-0000-7000-8000-00000000dead',
                ada.id,
            ),
        ).rejects.toThrow(ProjectNotFound);
    });
});
