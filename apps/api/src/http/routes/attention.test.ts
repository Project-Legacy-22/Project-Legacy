import { afterEach, describe, expect, it } from 'vitest';
import { makeIdentifyCaller, makeSignIn } from '@legacy/core-auth';
import { makeListAttention } from '@legacy/core-items';
import type { Item } from '@legacy/core-items';
import { inMemoryIdentityProvider } from '../../../../../packages/core/auth/test/fakes/in-memory-identity-provider.js';
import { anItem } from '../../../../../packages/core/items/test/builders/item.js';
import { inMemoryAttentionReader } from '../../../../../packages/core/items/test/fakes/in-memory-attention-reader.js';

import { createServer } from '../server.js';
import { SESSION_COOKIE } from '../session.js';
import { recordingLogger } from '../../../../../packages/contracts/test/fakes/recording-logger.js';
import { listen, testConfig } from '../../../test/http-harness.js';
import type { Harness } from '../../../test/http-harness.js';
import { makeAppUseCases } from '../../../test/fakes/app-use-cases.js';

const OWNER_ID = '00000000-0000-7000-8000-000000000001';
const PROJECT_ID = '00000000-0000-7000-8000-000000000010';
const ITEM_ID = '11111111-1111-4111-8111-111111111111';
const ADRESSE = 'alice@example.com';
const MOT_DE_PASSE = 'MotDePasse2026';

describe('GET /projects/attention', () => {
    let harness: Harness;

    async function serve(seed: Item[], options: { signedIn: boolean } = { signedIn: true }): Promise<void> {
        const provider = inMemoryIdentityProvider([{ id: OWNER_ID, email: ADRESSE, password: MOT_DE_PASSE }]);
        const session = await makeSignIn(provider)(ADRESSE, MOT_DE_PASSE);
        const reader = inMemoryAttentionReader(seed, [{ id: PROJECT_ID, name: 'Maison', memberIds: [OWNER_ID] }]);
        const useCases = makeAppUseCases({
            attention: { listAttention: makeListAttention(reader) },
            auth: { identifyCaller: makeIdentifyCaller(provider) },
        });
        const logger = recordingLogger();

        harness = await listen(
            createServer(testConfig, useCases, { logger }),
            logger,
            options.signedIn ? `${SESSION_COOKIE}=${session.accessToken}` : undefined,
        );
    }

    afterEach(() => harness.close());

    it('renvoie les groupes, chaque tache avec le nom de son projet et sans son proprietaire', async () => {
        await serve([anItem({ id: ITEM_ID, projectId: PROJECT_ID, ownerId: OWNER_ID, dueDate: '2026-09-20' })]);

        const response = await harness.request('/projects/attention?today=2026-09-23');

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            overdue: {
                items: [
                    {
                        id: ITEM_ID,
                        projectId: PROJECT_ID,
                        name: 'A sample item',
                        status: 'todo',
                        version: 1,
                        position: ITEM_ID,
                        priority: 'normal',
                        dueDate: '2026-09-20',
                        projectName: 'Maison',
                    },
                ],
                hasMore: false,
            },
            dueSoon: { items: [], hasMore: false },
            highPriority: { items: [], hasMore: false },
            workload: 'open',
        });
    });

    it('dit quand la personne n a encore aucune tache', async () => {
        await serve([]);

        const response = await harness.request('/projects/attention?today=2026-09-23');

        await expect(response.json()).resolves.toMatchObject({ workload: 'none' });
    });

    it.each(['', '?today=', '?today=2026-02-30', '?today=23%2F09%2F2026'])(
        'refuse %j en 400 : le jour de la personne est obligatoire et doit exister',
        async (query) => {
            await serve([]);

            const response = await harness.request(`/projects/attention${query}`);

            expect(response.status).toBe(400);
        },
    );

    it('refuse une requete sans session', async () => {
        await serve([anItem({ projectId: PROJECT_ID, ownerId: OWNER_ID, dueDate: '2026-09-20' })], {
            signedIn: false,
        });

        const response = await harness.request('/projects/attention?today=2026-09-23');

        expect(response.status).toBe(401);
    });
});
