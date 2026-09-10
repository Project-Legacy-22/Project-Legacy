import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ItemPageDto, ProjectDto, ProjectPageDto } from '@legacy/contracts';
import type { Database } from '../../../../packages/infra/src/database.types.js';
import { json } from '../http-harness.js';
import type { Harness } from '../http-harness.js';
import { integrationConfig, realApplication, registerAndSignIn, serveAs } from './support.js';
import type { RealAccount } from './support.js';

const REMOVED_AT = '2026-09-10T08:00:00.000Z';

function storedItems(projectId: string, ownerId: string, options: { count: number; deletedAt: string | null }) {
    return Array.from({ length: options.count }, () => ({
        id: randomUUID(),
        project_id: projectId,
        user_id: ownerId,
        name: 'Project count fixture',
        deleted_at: options.deletedAt,
    }));
}

async function seedItems(projectId: string, ownerId: string, counts: { visible: number; removed: number }) {
    const rows = [
        ...storedItems(projectId, ownerId, {
            count: counts.visible,
            deletedAt: null,
        }),
        ...storedItems(projectId, ownerId, {
            count: counts.removed,
            deletedAt: REMOVED_AT,
        }),
    ];
    if (rows.length === 0) return;

    // Fixture setup needs retained rows that the normal item list hides. The
    // assertions below use the real HTTP routes, not the service-role client.
    const config = integrationConfig();
    const client = createClient<Database>(config.supabaseUrl, config.supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.from('items').insert(rows);
    if (error)
        throw new Error('Unable to prepare project count fixtures', {
            cause: error,
        });
}

describe('project item counts (integration)', () => {
    const app = realApplication();
    let owner: RealAccount;
    let asOwner: Harness;

    beforeAll(async () => {
        await app.start();
        owner = await registerAndSignIn(app, 'IntegrationTest2026');
        asOwner = await serveAs(app, owner.cookie);
    });

    afterAll(async () => {
        await asOwner?.close();
        try {
            // Only this suite's newly created account and its fixtures are removed.
            if (owner !== undefined) await app.useCases.account.eraseAccount(owner, owner.email);
        } finally {
            await app.stop();
        }
    });

    it.each([
        { name: 'an empty project', visible: 0, removed: 0 },
        { name: 'a project containing only removed items', visible: 0, removed: 2 },
        {
            name: 'a project containing visible and removed items',
            visible: 2,
            removed: 1,
        },
    ])('counts only visible items and keeps $name in the project list', async (counts) => {
        const creation = await asOwner.request('/projects', json('POST', { name: counts.name }));
        const project = ProjectDto.parse(await creation.json());
        await seedItems(project.id, owner.id, counts);

        const response = await asOwner.request('/projects');
        const page = ProjectPageDto.parse(await response.json());
        const itemsResponse = await asOwner.request(`/projects/${project.id}/items`);
        const items = ItemPageDto.parse(await itemsResponse.json());

        expect(response.status).toBe(200);
        expect(itemsResponse.status).toBe(200);
        expect(items.items).toHaveLength(counts.visible);
        expect(page.projects).toContainEqual({
            ...project,
            itemCount: counts.visible,
        });
    });
});
