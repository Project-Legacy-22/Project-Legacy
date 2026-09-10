import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeSignIn } from '@legacy/core-auth';
import type { Item } from '@legacy/core-items';

import { recordingLogger } from '../../../../../packages/contracts/test/fakes/recording-logger.js';
import { inMemoryIdentityProvider } from '../../../../../packages/core/auth/test/fakes/in-memory-identity-provider.js';
import { inMemoryItemRepository } from '../../../../../packages/core/items/test/fakes/in-memory-item-repository.js';
import type { InMemoryItemRepository } from '../../../../../packages/core/items/test/fakes/in-memory-item-repository.js';
import { json, listen, testConfig } from '../../../test/http-harness.js';
import type { Harness } from '../../../test/http-harness.js';
import { makeItemRouteUseCases } from '../../../test/fakes/item-route-use-cases.js';
import { createServer } from '../server.js';
import { SESSION_COOKIE } from '../session.js';

const GENERATED_ID = '33333333-3333-4333-8333-333333333333';
const OWNER_ID = '00000000-0000-7000-8000-000000000001';
const PROJECT_ID = '00000000-0000-7000-8000-000000000010';
const EXISTING_ID = '11111111-1111-4111-8111-111111111111';
const ITEMS_PATH = `/projects/${PROJECT_ID}/items`;

function anItem(): Item {
    return {
        id: EXISTING_ID,
        name: 'Intact',
        status: 'todo',
        version: 1,
        priority: 'normal',
        dueDate: null,
        projectId: PROJECT_ID,
        ownerId: OWNER_ID,
    };
}

describe('item planning HTTP boundary', () => {
    let harness: Harness;
    let store: InMemoryItemRepository;

    async function serve(seed: Item[] = []): Promise<void> {
        store = inMemoryItemRepository(seed, [{ projectId: PROJECT_ID, userId: OWNER_ID }]);
        const provider = inMemoryIdentityProvider([
            { id: OWNER_ID, email: 'alice@example.com', password: 'MotDePasse2026' },
        ]);
        const session = await makeSignIn(provider)('alice@example.com', 'MotDePasse2026');
        const logger = recordingLogger();
        harness = await listen(
            createServer(
                testConfig,
                makeItemRouteUseCases({ repository: store, provider, generatedId: GENERATED_ID, projectId: PROJECT_ID }),
                logger,
            ),
            logger,
            `${SESSION_COOKIE}=${session.accessToken}`,
        );
    }

    async function reseed(seed: Item[]): Promise<void> {
        await harness.close();
        await serve(seed);
    }

    beforeEach(() => serve());
    afterEach(() => harness.close());

    it('creates a high-priority item with a past due date', async () => {
        const response = await harness.request(
            ITEMS_PATH,
            json('POST', { name: 'Handle delay', priority: 'high', dueDate: '2020-01-02' }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ priority: 'high', dueDate: '2020-01-02' });
        expect(store.items.get(GENERATED_ID)).toMatchObject({ priority: 'high', dueDate: '2020-01-02' });
    });

    it('rejects unknown priorities and invalid calendar dates', async () => {
        const priority = await harness.request(ITEMS_PATH, json('POST', { name: 'Intact', priority: 'urgent' }));
        const dueDate = await harness.request(ITEMS_PATH, json('POST', { name: 'Intact', dueDate: '2026-02-30' }));

        expect([priority.status, dueDate.status]).toEqual([400, 400]);
        expect(store.items.has(GENERATED_ID)).toBe(false);
    });

    it('updates and clears item planning fields', async () => {
        await reseed([anItem()]);

        const planned = await harness.request(
            `${ITEMS_PATH}/${EXISTING_ID}`,
            json('PUT', { name: 'Planned', priority: 'high', dueDate: '2020-01-02' }),
        );
        const cleared = await harness.request(
            `${ITEMS_PATH}/${EXISTING_ID}`,
            json('PUT', { name: 'No date', dueDate: null }),
        );

        expect([planned.status, cleared.status]).toEqual([200, 200]);
        expect(store.items.get(EXISTING_ID)).toMatchObject({ name: 'No date', priority: 'high', dueDate: null });
    });
});
