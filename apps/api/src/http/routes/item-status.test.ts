import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeSignIn } from '@legacy/core-auth';
import type { Item } from '@legacy/core-items';

import { inMemoryIdentityProvider } from '../../../../../packages/core/auth/test/fakes/in-memory-identity-provider.js';
import { inMemoryItemRepository } from '../../../../../packages/core/items/test/fakes/in-memory-item-repository.js';
import type {
    InMemoryItemRepository,
    ProjectMembership,
} from '../../../../../packages/core/items/test/fakes/in-memory-item-repository.js';
import { recordingLogger } from '../../../../../packages/contracts/test/fakes/recording-logger.js';
import { json, listen, testConfig } from '../../../test/http-harness.js';
import type { Harness } from '../../../test/http-harness.js';
import { makeItemRouteUseCases } from '../../../test/fakes/item-route-use-cases.js';
import { createServer } from '../server.js';
import { SESSION_COOKIE } from '../session.js';

const OWNER_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_OWNER_ID = '00000000-0000-7000-8000-000000000002';
const PROJECT_ID = '00000000-0000-7000-8000-000000000010';
const EXISTING_ID = '11111111-1111-4111-8111-111111111111';
const UNKNOWN_ID = '22222222-2222-4222-8222-222222222222';
const PATH = `/projects/${PROJECT_ID}/items`;

function anItem(ownerId = OWNER_ID): Item {
    return {
        id: EXISTING_ID,
        projectId: PROJECT_ID,
        ownerId,
        name: 'Prepare the review',
        status: 'todo',
        version: 1,
        priority: 'normal',
        dueDate: null,
    };
}

describe('PATCH /projects/:projectId/items/:id/status', () => {
    let harness: Harness;
    let store: InMemoryItemRepository;

    async function serve(
        seed: Item[] = [],
        memberships: ProjectMembership[] = [{ projectId: PROJECT_ID, userId: OWNER_ID }],
    ): Promise<void> {
        store = inMemoryItemRepository(seed, memberships);
        const provider = inMemoryIdentityProvider([
            { id: OWNER_ID, email: 'alice@example.com', password: 'MotDePasse2026' },
        ]);
        const session = await makeSignIn(provider)('alice@example.com', 'MotDePasse2026');
        const logger = recordingLogger();
        harness = await listen(
            createServer(
                testConfig,
                makeItemRouteUseCases({ repository: store, provider, generatedId: UNKNOWN_ID, projectId: PROJECT_ID }),
                logger,
            ),
            logger,
            `${SESSION_COOKIE}=${session.accessToken}`,
        );
    }

    async function reseed(seed: Item[], memberships?: ProjectMembership[]): Promise<void> {
        await harness.close();
        await serve(seed, memberships);
    }

    beforeEach(() => serve());
    afterEach(() => harness.close());

    it('moves an item for a project member', async () => {
        await reseed([anItem(OTHER_OWNER_ID)]);

        const response = await harness.request(
            `${PATH}/${EXISTING_ID}/status`,
            json('PATCH', { status: 'doing', version: 1 }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ status: 'doing', version: 2 });
        expect(store.items.get(EXISTING_ID)).toMatchObject({ status: 'doing', version: 2 });
    });

    it('returns the same absence for a non-member and a missing item', async () => {
        await reseed([anItem(OTHER_OWNER_ID)], []);
        const denied = await harness.request(
            `${PATH}/${EXISTING_ID}/status`,
            json('PATCH', { status: 'done', version: 1 }),
        );
        await reseed([], [{ projectId: PROJECT_ID, userId: OWNER_ID }]);
        const missing = await harness.request(
            `${PATH}/${UNKNOWN_ID}/status`,
            json('PATCH', { status: 'done', version: 1 }),
        );

        expect([denied.status, missing.status]).toEqual([404, 404]);
        expect((await denied.json()) as object).toMatchObject({ type: 'item_not_found' });
        expect((await missing.json()) as object).toMatchObject({ type: 'item_not_found' });
    });

    it('rejects an unknown status and a non-positive version', async () => {
        await reseed([anItem()]);
        const invalidStatus = await harness.request(
            `${PATH}/${EXISTING_ID}/status`,
            json('PATCH', { status: 'blocked', version: 1 }),
        );
        const invalidVersion = await harness.request(
            `${PATH}/${EXISTING_ID}/status`,
            json('PATCH', { status: 'doing', version: 0 }),
        );

        expect([invalidStatus.status, invalidVersion.status]).toEqual([400, 400]);
        expect(store.items.get(EXISTING_ID)).toMatchObject({ status: 'todo', version: 1 });
    });

    it('reports a stale move without overwriting the current state', async () => {
        await reseed([anItem()]);
        await harness.request(`${PATH}/${EXISTING_ID}/status`, json('PATCH', { status: 'doing', version: 1 }));
        const stale = await harness.request(
            `${PATH}/${EXISTING_ID}/status`,
            json('PATCH', { status: 'done', version: 1 }),
        );

        expect(stale.status).toBe(409);
        expect((await stale.json()) as object).toMatchObject({ type: 'item_status_conflict' });
        expect(store.items.get(EXISTING_ID)).toMatchObject({ status: 'doing', version: 2 });
    });
});
