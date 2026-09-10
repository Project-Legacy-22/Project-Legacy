import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { json } from '../http-harness.js';
import type { Harness } from '../http-harness.js';
import { realApplication, registerAndSignIn, serveAs } from './support.js';
import type { RealAccount } from './support.js';

const MOT_DE_PASSE = 'IntegrationTest2026';

describe('projects API (integration)', () => {
    let app: Awaited<ReturnType<typeof realApplication>>;
    let owner: RealAccount;
    let intruder: RealAccount;
    let asOwner: Harness;
    let asIntruder: Harness;

    beforeAll(async () => {
        app = realApplication();
        await app.start();
        owner = await registerAndSignIn(app, MOT_DE_PASSE);
        intruder = await registerAndSignIn(app, MOT_DE_PASSE);
        asOwner = await serveAs(app, owner.cookie);
        asIntruder = await serveAs(app, intruder.cookie);
    });

    afterAll(async () => {
        await asOwner.close();
        await asIntruder.close();
        await app.stop();
    });

    it('sert le projet par defaut cree avec le compte', async () => {
        const response = await asOwner.request('/projects');
        const page = (await response.json()) as {
            projects: { id: string; role: string }[];
        };

        expect(response.status).toBe(200);
        expect(page.projects).toContainEqual(expect.objectContaining({ id: owner.projectId, role: 'owner' }));
    });

    it('cree un projet et son appartenance proprietaire', async () => {
        const creation = await asOwner.request('/projects', json('POST', { name: 'Integration roadmap' }));
        const project = (await creation.json()) as { id: string; role: string };
        const page = (await (await asOwner.request('/projects')).json()) as {
            projects: { id: string }[];
        };

        expect(creation.status).toBe(200);
        expect(project.role).toBe('owner');
        expect(page.projects.map((candidate) => candidate.id)).toContain(project.id);
    });

    it('cache un projet a un non-membre et refuse sa suppression', async () => {
        const creation = await asOwner.request('/projects', json('POST', { name: 'Private integration project' }));
        const project = (await creation.json()) as { id: string };

        const deniedList = (await (await asIntruder.request('/projects')).json()) as {
            projects: { id: string }[];
        };
        const deniedDelete = await asIntruder.request(`/projects/${project.id}`, {
            method: 'DELETE',
        });
        const ownerList = (await (await asOwner.request('/projects')).json()) as {
            projects: { id: string }[];
        };

        expect(deniedList.projects.map((candidate) => candidate.id)).not.toContain(project.id);
        expect(deniedDelete.status).toBe(404);
        expect(ownerList.projects.map((candidate) => candidate.id)).toContain(project.id);
    });

    it('supprime un projet possede et ses items', async () => {
        const creation = await asOwner.request('/projects', json('POST', { name: 'Disposable integration project' }));
        const project = (await creation.json()) as { id: string };
        await asOwner.request(`/projects/${project.id}/items`, json('POST', { name: 'Deleted by project cascade' }));

        const deletion = await asOwner.request(`/projects/${project.id}`, {
            method: 'DELETE',
        });
        const itemsAfter = await asOwner.request(`/projects/${project.id}/items`);

        expect(deletion.status).toBe(200);
        expect(itemsAfter.status).toBe(404);
    });
});
