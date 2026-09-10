import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeSignIn } from '@legacy/core-auth';
import type { Item } from '@legacy/core-items';
import { inMemoryIdentityProvider } from '../../../../../packages/core/auth/test/fakes/in-memory-identity-provider.js';
import { inMemoryItemRepository } from '../../../../../packages/core/items/test/fakes/in-memory-item-repository.js';
import type {
    InMemoryItemRepository,
    ProjectMembership,
} from '../../../../../packages/core/items/test/fakes/in-memory-item-repository.js';

import { createServer } from '../server.js';
import { SESSION_COOKIE } from '../session.js';
import { recordingLogger } from '../../../../../packages/contracts/test/fakes/recording-logger.js';
import { json, listen, testConfig } from '../../../test/http-harness.js';
import type { Harness } from '../../../test/http-harness.js';
import { makeItemRouteUseCases } from '../../../test/fakes/item-route-use-cases.js';

const GENERATED_ID = '33333333-3333-4333-8333-333333333333';
const OWNER_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_OWNER_ID = '00000000-0000-7000-8000-000000000002';

// Identifiers are UUIDs by contract (packages/contracts ItemIdParams), so the
// fixtures use real ones: a readable string such as 'item-1' would be rejected
// at the boundary, and the test would prove nothing about the route behind it.
const PROJECT_ID = '00000000-0000-7000-8000-000000000010';
const UNKNOWN_PROJECT_ID = '00000000-0000-7000-8000-000000000099';
const EXISTING_ID = '11111111-1111-4111-8111-111111111111';
const UNKNOWN_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ID = '44444444-4444-4444-8444-444444444444';
const ADRESSE = 'alice@example.com';
const MOT_DE_PASSE = 'MotDePasse2026';
const ITEMS_PATH = `/projects/${PROJECT_ID}/items`;

type Page = { items: { id: string }[]; nextCursor: string | null };

function anItemOf(candidate: { id: string; ownerId: string; name?: string; projectId?: string }): Item {
    return {
        id: candidate.id,
        name: candidate.name ?? 'Acheter du pain',
        status: 'todo',
        version: 1,
        priority: 'normal',
        dueDate: null,
        projectId: candidate.projectId ?? PROJECT_ID,
        ownerId: candidate.ownerId,
    };
}

describe('items API', () => {
    let harness: Harness;
    let store: InMemoryItemRepository;

    async function serve(
        seed: Item[] = [],
        memberships: ProjectMembership[] = [{ projectId: PROJECT_ID, userId: OWNER_ID }],
    ): Promise<void> {
        store = inMemoryItemRepository(seed, memberships);
        const provider = inMemoryIdentityProvider([{ id: OWNER_ID, email: ADRESSE, password: MOT_DE_PASSE }]);
        const session = await makeSignIn(provider)(ADRESSE, MOT_DE_PASSE);
        const logger = recordingLogger();
        harness = await listen(
            createServer(
                testConfig,
                makeItemRouteUseCases({
                    repository: store,
                    provider,
                    generatedId: GENERATED_ID,
                    projectId: PROJECT_ID,
                }),
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

    describe('GET /projects/:projectId/items', () => {
        it('returns the project items to a member, including another member item', async () => {
            await reseed([
                anItemOf({ id: EXISTING_ID, ownerId: OWNER_ID, name: 'Le mien' }),
                anItemOf({ id: OTHER_ID, ownerId: OTHER_OWNER_ID, name: 'Partage' }),
            ]);

            const response = await harness.request(ITEMS_PATH);

            expect(response.status).toBe(200);
            const page = (await response.json()) as Page;
            expect(page.items.map((item) => item.id)).toEqual([EXISTING_ID, OTHER_ID]);
            expect(JSON.stringify(page)).not.toContain(OWNER_ID);
        });

        it('returns the same absence for a non-member and an unknown project', async () => {
            await reseed([anItemOf({ id: EXISTING_ID, ownerId: OTHER_OWNER_ID })], []);

            const denied = await harness.request(ITEMS_PATH);
            const unknown = await harness.request(`/projects/${UNKNOWN_PROJECT_ID}/items`);

            expect(denied.status).toBe(404);
            expect(unknown.status).toBe(404);
            expect((await denied.json()) as object).toMatchObject({
                type: 'project_not_found',
            });
            expect((await unknown.json()) as object).toMatchObject({
                type: 'project_not_found',
            });
        });

        it('paginates without repeating or skipping an item', async () => {
            await reseed([
                anItemOf({ id: EXISTING_ID, ownerId: OWNER_ID }),
                anItemOf({ id: OTHER_ID, ownerId: OWNER_ID }),
            ]);

            const first = (await (await harness.request(`${ITEMS_PATH}?limit=1`)).json()) as Page;
            const second = (await (
                await harness.request(`${ITEMS_PATH}?limit=1&cursor=${encodeURIComponent(String(first.nextCursor))}`)
            ).json()) as Page;

            expect(first.items.map((item) => item.id)).toEqual([EXISTING_ID]);
            expect(second.items.map((item) => item.id)).toEqual([OTHER_ID]);
            expect(second.nextCursor).toBeNull();
        });

        it('rejects an invalid page size or cursor', async () => {
            expect((await harness.request(`${ITEMS_PATH}?limit=1000`)).status).toBe(400);
            expect((await harness.request(`${ITEMS_PATH}?cursor=invente`)).status).toBe(400);
        });
    });

    describe('POST /projects/:projectId/items', () => {
        it('creates an item in the project for a member', async () => {
            const response = await harness.request(ITEMS_PATH, json('POST', { name: 'Acheter du pain' }));

            expect(response.status).toBe(200);
            await expect(response.json()).resolves.toEqual({
                id: GENERATED_ID,
                projectId: PROJECT_ID,
                name: 'Acheter du pain',
                status: 'todo',
                version: 1,
                priority: 'normal',
                dueDate: null,
            });
            expect(store.items.get(GENERATED_ID)).toMatchObject({
                projectId: PROJECT_ID,
                ownerId: OWNER_ID,
            });
        });

        it('returns the same absence for a non-member and an unknown project', async () => {
            await reseed([], []);

            const denied = await harness.request(ITEMS_PATH, json('POST', { name: 'Secret' }));
            const unknown = await harness.request(
                `/projects/${UNKNOWN_PROJECT_ID}/items`,
                json('POST', { name: 'Secret' }),
            );

            expect(denied.status).toBe(404);
            expect(unknown.status).toBe(404);
            expect(store.items.size).toBe(0);
        });

        it('rejects an invalid name without echoing it', async () => {
            const submitted = 'valeur-personnelle-'.repeat(20);
            const response = await harness.request(ITEMS_PATH, json('POST', { name: submitted }));
            const problem = (await response.json()) as { detail: string };

            expect(response.status).toBe(400);
            expect(problem.detail).not.toContain(submitted);
            expect(store.items.size).toBe(0);
        });
    });

    describe('PUT /projects/:projectId/items/:id', () => {
        it('allows a member to update an item created by another member', async () => {
            await reseed([
                anItemOf({
                    id: EXISTING_ID,
                    ownerId: OTHER_OWNER_ID,
                    name: 'Ancien nom',
                }),
            ]);

            const response = await harness.request(
                `${ITEMS_PATH}/${EXISTING_ID}`,
                json('PUT', { name: 'Nouveau nom' }),
            );

            expect(response.status).toBe(200);
            expect(store.items.get(EXISTING_ID)).toMatchObject({
                name: 'Nouveau nom',
                status: 'todo',
                version: 2,
                ownerId: OTHER_OWNER_ID,
            });
        });

        it('returns the same absence for a non-member and an unknown project', async () => {
            const item = anItemOf({
                id: EXISTING_ID,
                ownerId: OTHER_OWNER_ID,
                name: 'Intact',
            });
            await reseed([item], []);

            expect(await store.findByIdForMember(EXISTING_ID, PROJECT_ID, OTHER_OWNER_ID)).toEqual(item);

            const denied = await harness.request(
                `${ITEMS_PATH}/${EXISTING_ID}`,
                json('PUT', { name: 'Modifie' }),
            );
            const unknown = await harness.request(
                `/projects/${UNKNOWN_PROJECT_ID}/items/${EXISTING_ID}`,
                json('PUT', { name: 'Modifie' }),
            );

            expect(denied.status).toBe(404);
            expect(unknown.status).toBe(404);
            expect(store.items.get(EXISTING_ID)).toEqual(item);
        });

        it('returns the same absence for an inaccessible and a missing item', async () => {
            const inaccessible = anItemOf({ id: EXISTING_ID, ownerId: OTHER_OWNER_ID });
            await reseed([inaccessible], []);

            expect(await store.findByIdForMember(EXISTING_ID, PROJECT_ID, OTHER_OWNER_ID)).toEqual(inaccessible);
            const denied = await harness.request(
                `${ITEMS_PATH}/${EXISTING_ID}`,
                json('PUT', { name: 'Modifie' }),
            );
            await reseed([], [{ projectId: PROJECT_ID, userId: OWNER_ID }]);
            const missing = await harness.request(
                `${ITEMS_PATH}/${UNKNOWN_ID}`,
                json('PUT', { name: 'Modifie' }),
            );

            expect(denied.status).toBe(404);
            expect(missing.status).toBe(404);
            expect((await denied.json()) as object).toMatchObject({ type: 'item_not_found' });
            expect((await missing.json()) as object).toMatchObject({ type: 'item_not_found' });
        });

        it('rejects empty and overlong names without changing the item', async () => {
            const item = anItemOf({ id: EXISTING_ID, ownerId: OWNER_ID, name: 'Intact' });
            await reseed([item]);

            const empty = await harness.request(
                `${ITEMS_PATH}/${EXISTING_ID}`,
                json('PUT', { name: '   ' }),
            );
            const overlong = await harness.request(
                `${ITEMS_PATH}/${EXISTING_ID}`,
                json('PUT', { name: 'a'.repeat(256) }),
            );

            expect(empty.status).toBe(400);
            expect(overlong.status).toBe(400);
            expect(store.items.get(EXISTING_ID)).toEqual(item);
        });

        it('rejects an invalid identifier and an incomplete body', async () => {
            expect(
                (await harness.request(`${ITEMS_PATH}/pas-un-uuid`, json('PUT', { name: 'Nom' })))
                    .status,
            ).toBe(400);
            expect((await harness.request(`${ITEMS_PATH}/${UNKNOWN_ID}`, json('PUT', {}))).status).toBe(
                400,
            );
        });
    });

    describe('DELETE /projects/:projectId/items/:id', () => {
        it('allows a member to delete an item created by another member', async () => {
            await reseed([anItemOf({ id: EXISTING_ID, ownerId: OTHER_OWNER_ID })]);

            const response = await harness.request(`${ITEMS_PATH}/${EXISTING_ID}`, {
                method: 'DELETE',
            });

            expect(response.status).toBe(204);
            expect(store.items.has(EXISTING_ID)).toBe(false);
        });

        it('returns the same absence for a non-member and an unknown project', async () => {
            const item = anItemOf({ id: EXISTING_ID, ownerId: OTHER_OWNER_ID });
            await reseed([item], []);

            expect(await store.findByIdForMember(EXISTING_ID, PROJECT_ID, OTHER_OWNER_ID)).toEqual(item);

            const denied = await harness.request(`${ITEMS_PATH}/${EXISTING_ID}`, {
                method: 'DELETE',
            });
            const unknown = await harness.request(`/projects/${UNKNOWN_PROJECT_ID}/items/${EXISTING_ID}`, {
                method: 'DELETE',
            });

            expect(denied.status).toBe(404);
            expect(unknown.status).toBe(404);
            expect(store.items.get(EXISTING_ID)).toEqual(item);
        });

        it('returns the same absence for an inaccessible and a missing item', async () => {
            const inaccessible = anItemOf({ id: EXISTING_ID, ownerId: OTHER_OWNER_ID });
            await reseed([inaccessible], []);

            expect(await store.findByIdForMember(EXISTING_ID, PROJECT_ID, OTHER_OWNER_ID)).toEqual(inaccessible);
            const denied = await harness.request(`${ITEMS_PATH}/${EXISTING_ID}`, { method: 'DELETE' });
            await reseed([], [{ projectId: PROJECT_ID, userId: OWNER_ID }]);
            const missing = await harness.request(`${ITEMS_PATH}/${UNKNOWN_ID}`, { method: 'DELETE' });

            expect(denied.status).toBe(404);
            expect(missing.status).toBe(404);
            expect((await denied.json()) as object).toMatchObject({ type: 'item_not_found' });
            expect((await missing.json()) as object).toMatchObject({ type: 'item_not_found' });
        });
    });

    it('never writes an item name to logs', async () => {
        await harness.request(ITEMS_PATH, json('POST', { name: 'Acheter du pain' }));
        expect(JSON.stringify(harness.logger.lines)).not.toContain('Acheter du pain');
    });
});
