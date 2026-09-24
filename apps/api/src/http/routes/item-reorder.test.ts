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

const OWNER_ID = '00000000-0000-7000-8000-000000000001';
const PROJECT_ID = '00000000-0000-7000-8000-000000000010';
const FIRST_ID = '00000000-0000-7000-8000-000000000011';
const SECOND_ID = '00000000-0000-7000-8000-000000000012';
const PATH = `/projects/${PROJECT_ID}/items/${SECOND_ID}/position`;

function anItem(id: string): Item {
    return {
        id, position: id, projectId: PROJECT_ID, ownerId: OWNER_ID, assigneeIds: [],
        name: 'An item', status: 'todo', version: 1, priority: 'normal', dueDate: null,
    };
}

describe('PATCH /projects/:projectId/items/:id/position', () => {
    let harness: Harness;
    let store: InMemoryItemRepository;

    async function serve(isMember = true): Promise<void> {
        store = inMemoryItemRepository(
            [anItem(FIRST_ID), anItem(SECOND_ID)],
            isMember ? [{ projectId: PROJECT_ID, userId: OWNER_ID }] : [],
        );
        const provider = inMemoryIdentityProvider([
            { id: OWNER_ID, email: 'alice@example.com', password: 'MotDePasse2026' },
        ]);
        const session = await makeSignIn(provider)('alice@example.com', 'MotDePasse2026');
        const logger = recordingLogger();
        harness = await listen(
            createServer(testConfig, makeItemRouteUseCases({
                repository: store, provider, generatedId: SECOND_ID, projectId: PROJECT_ID,
            }), { logger }),
            logger,
            `${SESSION_COOKIE}=${session.accessToken}`,
        );
    }

    beforeEach(() => serve());
    afterEach(() => harness.close());

    it('swaps positions and returns the persisted version without changing status', async () => {
        const response = await harness.request(PATH, json('PATCH', { position: FIRST_ID, version: 1 }));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ position: FIRST_ID, status: 'todo', version: 2 });
        expect(store.items.get(FIRST_ID)).toMatchObject({ position: SECOND_ID, version: 2 });
    });

    it('rejects an invalid position with a typed 400', async () => {
        const response = await harness.request(PATH, json('PATCH', {
            position: '00000000-0000-7000-8000-000000000099', version: 1,
        }));

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ type: 'invalid_item_position' });
    });

    it('rejects a stale version without silently overwriting the first move', async () => {
        await harness.request(PATH, json('PATCH', { position: FIRST_ID, version: 1 }));
        const response = await harness.request(PATH, json('PATCH', { position: FIRST_ID, version: 1 }));

        expect(response.status).toBe(409);
        expect(store.items.get(SECOND_ID)).toMatchObject({ position: FIRST_ID, version: 2 });
    });

    it('refuses malformed input at the HTTP boundary', async () => {
        const response = await harness.request(PATH, json('PATCH', { position: 'bad', version: 0 }));

        expect(response.status).toBe(400);
        expect(store.items.get(SECOND_ID)).toMatchObject({ position: SECOND_ID, version: 1 });
    });
});
