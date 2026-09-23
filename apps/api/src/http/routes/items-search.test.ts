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
import { listen, testConfig } from '../../../test/http-harness.js';
import type { Harness } from '../../../test/http-harness.js';
import { makeItemRouteUseCases } from '../../../test/fakes/item-route-use-cases.js';

// Search and filter query params on GET /projects/:projectId/items (US-32).
// Split from items.test.ts, which keeps the CRUD routes, to stay under the
// file-length ceiling in standards/02-code-style.md.
const GENERATED_ID = '33333333-3333-4333-8333-333333333333';
const OWNER_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_OWNER_ID = '00000000-0000-7000-8000-000000000002';
const PROJECT_ID = '00000000-0000-7000-8000-000000000010';
const EXISTING_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '44444444-4444-4444-8444-444444444444';
const ADRESSE = 'alice@example.com';
const MOT_DE_PASSE = 'MotDePasse2026';
const ITEMS_PATH = `/projects/${PROJECT_ID}/items`;

type Page = { items: { id: string; name: string | null }[]; nextCursor: string | null };

function anItemOf(candidate: { id: string; ownerId: string; name?: string; projectId?: string }): Item {
    return {
        id: candidate.id,
        position: candidate.id,
        name: candidate.name ?? 'Acheter du pain',
        status: 'todo',
        version: 1,
        priority: 'normal',
        dueDate: null,
        projectId: candidate.projectId ?? PROJECT_ID,
        ownerId: candidate.ownerId,
    };
}

describe('GET /projects/:projectId/items search and filters', () => {
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
                { logger },
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

    it('finds an accented name without distinguishing case or accent', async () => {
        await reseed([anItemOf({ id: EXISTING_ID, ownerId: OWNER_ID, name: 'Relire le café des sponsors' })]);

        const response = await harness.request(`${ITEMS_PATH}?search=CAFE`);
        const page = (await response.json()) as Page;

        expect(page.items.map((item) => item.id)).toEqual([EXISTING_ID]);
    });

    it('filters by status, priority and due date, combined with search', async () => {
        await reseed([
            anItemOf({ id: EXISTING_ID, ownerId: OWNER_ID, name: 'Relire le café des sponsors' }),
            anItemOf({ id: OTHER_ID, ownerId: OWNER_ID, name: 'Deployer' }),
        ]);

        const search = await harness.request(`${ITEMS_PATH}?search=cafe`);
        const status = await harness.request(`${ITEMS_PATH}?status=todo`);
        const combined = await harness.request(`${ITEMS_PATH}?search=CAFE&status=todo&priority=normal`);

        expect(((await search.json()) as Page).items.map((item) => item.id)).toEqual([EXISTING_ID]);
        expect(((await status.json()) as Page).items.map((item) => item.id)).toEqual([EXISTING_ID, OTHER_ID]);
        expect(((await combined.json()) as Page).items.map((item) => item.id)).toEqual([EXISTING_ID]);
    });

    // The API answers an empty project and a filter that matches nothing with
    // the same shape on purpose: the caller already knows whether a filter is
    // active, so the "no data" vs "no results" distinction is made on the
    // frontend (see items-filters.tsx), not encoded here.
    it('answers an empty project and a filter matching nothing with the same page shape', async () => {
        await reseed([], [{ projectId: PROJECT_ID, userId: OWNER_ID }]);
        const noData = (await (await harness.request(ITEMS_PATH)).json()) as Page;

        await reseed([anItemOf({ id: EXISTING_ID, ownerId: OWNER_ID, name: 'Acheter du pain' })]);
        const noMatch = (await (await harness.request(`${ITEMS_PATH}?search=introuvable`)).json()) as Page;

        expect(noData.items).toEqual([]);
        expect(noMatch.items).toEqual([]);
    });

    it('rejects a cursor issued under different search or filter criteria', async () => {
        await reseed([
            anItemOf({ id: EXISTING_ID, ownerId: OWNER_ID, name: 'Une tache todo' }),
            anItemOf({ id: OTHER_ID, ownerId: OWNER_ID, name: 'Une autre tache todo' }),
        ]);

        const first = (await (await harness.request(`${ITEMS_PATH}?limit=1&status=todo`)).json()) as Page;
        const cursor = encodeURIComponent(String(first.nextCursor));

        const repeated = await harness.request(`${ITEMS_PATH}?limit=1&status=todo&cursor=${cursor}`);
        const changedCriteria = await harness.request(`${ITEMS_PATH}?limit=1&status=doing&cursor=${cursor}`);

        expect(repeated.status).toBe(200);
        expect(changedCriteria.status).toBe(400);
        expect((await changedCriteria.json()) as object).toMatchObject({ type: 'invalid_item_cursor' });
    });

    it('applies search and filters only within the accounts own accessible project', async () => {
        await reseed([anItemOf({ id: EXISTING_ID, ownerId: OTHER_OWNER_ID, name: 'Secret' })], []);

        const response = await harness.request(`${ITEMS_PATH}?search=secret&status=todo`);

        expect(response.status).toBe(404);
        expect((await response.json()) as object).toMatchObject({ type: 'project_not_found' });
    });

    it('never writes a search term to logs', async () => {
        await reseed([anItemOf({ id: EXISTING_ID, ownerId: OWNER_ID, name: 'Valeur personnelle' })]);
        await harness.request(`${ITEMS_PATH}?search=${encodeURIComponent('valeur-personnelle-'.repeat(20))}`);

        expect(JSON.stringify(harness.logger.lines)).not.toContain('valeur-personnelle-');
    });
});
