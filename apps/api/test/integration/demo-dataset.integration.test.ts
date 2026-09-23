import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ItemPageDto, ProjectPageDto } from '@legacy/contracts';

import type { Harness } from '../http-harness.js';
import { realApplication, serveAs } from './support.js';
import { SESSION_COOKIE } from '../../src/http/session.js';

// The accounts of supabase/seed.sql, as the README lists them. This file is the
// proof that what the README promises works: the rows the seed writes by hand
// into auth.users are accepted by GoTrue, and each account opens on the data
// the demonstration relies on. It reads, never writes, so the next run of the
// demonstration starts from the same state.
//
// The stack must have been seeded: `npm run db:reset`, or a first
// `supabase start`, which is what the pipeline runs.
const PASSWORD = 'DemoLegacy2026';

async function signedIn(app: ReturnType<typeof realApplication>, email: string): Promise<Harness> {
    const session = await app.useCases.auth.signIn(email, PASSWORD);
    return serveAs(app, `${SESSION_COOKIE}=${session.accessToken}`);
}

async function projectsOf(as: Harness): Promise<ProjectPageDto['projects']> {
    const response = await as.request('/projects');
    expect(response.status).toBe(200);
    return ((await response.json()) as ProjectPageDto).projects;
}

async function itemsOf(as: Harness, projectId: string): Promise<ItemPageDto['items']> {
    const response = await as.request(`/projects/${projectId}/items?limit=100`);
    expect(response.status).toBe(200);
    return ((await response.json()) as ItemPageDto).items;
}

// The seed dates its tasks from the day it runs, and a local stack may have been
// seeded days before this test runs. The overdue task is set three days before
// that day, so the seed day is read back from it rather than taken from the
// clock.
function daysAfter(date: string, days: number): string {
    const day = new Date(`${date}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + days);
    return day.toISOString().slice(0, 10);
}

const TODAY = new Date().toISOString().slice(0, 10);

describe('demonstration dataset (integration)', () => {
    const app = realApplication();
    let asCamille: Harness;
    let asHugo: Harness;

    beforeAll(async () => {
        asCamille = await signedIn(app, 'camille.demo@example.com');
        asHugo = await signedIn(app, 'hugo.demo@example.com');
    });

    afterAll(async () => {
        await Promise.all([asCamille.close(), asHugo.close()]);
    });

    it('gives each account its own projects', async () => {
        const camille = (await projectsOf(asCamille)).map(project => project.name).sort();
        const hugo = (await projectsOf(asHugo)).map(project => project.name);

        expect(camille).toEqual(['Mobile app launch', 'Website redesign']);
        expect(hugo).toEqual(['Office move']);
    });

    it('spreads the tasks over the three columns, with one overdue and one due on the seed day', async () => {
        const projects = await projectsOf(asCamille);
        const items = (await Promise.all(projects.map(project => itemsOf(asCamille, project.id)))).flat();

        expect(new Set(items.map(item => item.status))).toEqual(new Set(['todo', 'doing', 'done']));
        expect(new Set(items.map(item => item.priority))).toEqual(new Set(['low', 'normal', 'high']));
        const overdue = items.find(item => item.name === 'Fix the broken links in the footer');
        expect(overdue?.status).toBe('todo');
        expect(overdue?.dueDate != null && overdue.dueDate < TODAY).toBe(true);

        const seedDay = daysAfter(overdue?.dueDate ?? TODAY, 3);
        expect(items.some(item => item.status !== 'done' && item.dueDate === seedDay)).toBe(true);
    });

    it('opens with an unread notification', async () => {
        const response = await asCamille.request('/notifications/unread-count');

        expect(response.status).toBe(200);
        expect(((await response.json()) as { unread: number }).unread).toBeGreaterThan(0);
    });
});
