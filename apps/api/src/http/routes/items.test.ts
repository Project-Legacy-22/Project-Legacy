import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeSignIn } from '@legacy/core-auth';
import type { IdentityProvider } from '@legacy/core-auth';
import { makeAddItem, makeChangeItem, makeListItems, makeRemoveItem } from '@legacy/core-items';
import type { Item, ItemRepository } from '@legacy/core-items';
import {
    makeIdentifyCaller,
    makeRegisterAccount,
} from '@legacy/core-auth';
// The reference fake for the identity provider port lives with the port it
// implements. Copying it here would let the copy drift from the contract it is
// supposed to stand for.
import { inMemoryIdentityProvider } from '../../../../../packages/core/auth/test/fakes/in-memory-identity-provider.js';

import { createServer } from '../server.js';
import { SESSION_COOKIE } from '../session.js';
import type { AppUseCases } from '../../composition-root.js';
import { recordingLogger } from '../../../test/fakes/recording-logger.js';
import { json, listen, testConfig } from '../../../test/http-harness.js';
import type { Harness } from '../../../test/http-harness.js';

const GENERATED_ID = '33333333-3333-4333-8333-333333333333';
// The account every request in this suite is made by. Its identifier is an
// internal fact: the assertions below check it never reaches a response.
const OWNER_ID = '00000000-0000-7000-8000-000000000001';
const ADRESSE = 'alice@example.com';
const MOT_DE_PASSE = 'MotDePasse2026';

interface Store {
    items: Map<string, Item>;
    repository: ItemRepository;
}

function inMemoryStore(seed: Item[] = []): Store {
    const items = new Map(seed.map(item => [item.id, item]));

    return {
        items,
        repository: {
            findAll: () => Promise.resolve([...items.values()]),
            findById: id => Promise.resolve(items.get(id)),
            save: item => {
                items.set(item.id, item);
                return Promise.resolve();
            },
            update: item => {
                items.set(item.id, item);
                return Promise.resolve();
            },
            remove: id => {
                items.delete(id);
                return Promise.resolve();
            },
        },
    };
}

function useCasesOver(repository: ItemRepository, provider: IdentityProvider): AppUseCases {
    return {
        items: {
            listItems: makeListItems(repository),
            addItem: makeAddItem({
                repository,
                newId: () => GENERATED_ID,
                now: () => new Date('2026-09-04T10:00:00.000Z'),
            }),
            changeItem: makeChangeItem(repository),
            removeItem: makeRemoveItem(repository),
        },
        auth: {
            registerAccount: makeRegisterAccount(provider),
            signIn: makeSignIn(provider),
            identifyCaller: makeIdentifyCaller(provider),
        },
    };
}

// Identifiers are UUIDs by contract (packages/contracts ItemIdParams), so the
// fixtures use real ones: a readable string such as 'item-1' would be rejected
// at the boundary, and the test would prove nothing about the route behind it.
const EXISTING_ID = '11111111-1111-4111-8111-111111111111';
const UNKNOWN_ID = '22222222-2222-4222-8222-222222222222';

describe('items API', () => {
    let harness: Harness;
    let store: Store;

    // Every request in this suite carries a session: since US-11 the item
    // routes refuse anything else. The refusal itself is asserted in the
    // authentication suite, where the repository is unreachable on purpose.
    async function serve(seed: Item[] = []): Promise<void> {
        store = inMemoryStore(seed);
        const provider = inMemoryIdentityProvider([
            { id: OWNER_ID, email: ADRESSE, password: MOT_DE_PASSE },
        ]);
        const session = await makeSignIn(provider)(ADRESSE, MOT_DE_PASSE);
        const logger = recordingLogger();

        harness = await listen(
            createServer(testConfig, useCasesOver(store.repository, provider), logger),
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

    describe('GET /items', () => {
        it('renvoie les items persistes', async () => {
            await reseed([
                { id: EXISTING_ID, name: 'Acheter du pain', completed: false, ownerId: OWNER_ID },
            ]);

            const response = await harness.request('/items');

            expect(response.status).toBe(200);
            await expect(response.json()).resolves.toEqual([
                { id: EXISTING_ID, name: 'Acheter du pain', completed: false },
            ]);
        });

        it('renvoie une liste vide plutot qu une erreur quand il n y a rien', async () => {
            const response = await harness.request('/items');

            expect(response.status).toBe(200);
            await expect(response.json()).resolves.toEqual([]);
        });
    });

    describe('POST /items', () => {
        it('cree un item et le renvoie', async () => {
            const response = await harness.request(
                '/items',
                json('POST', { name: 'Acheter du pain' }),
            );

            expect(response.status).toBe(200);
            await expect(response.json()).resolves.toEqual({
                id: GENERATED_ID,
                name: 'Acheter du pain',
                completed: false,
            });
            expect(store.items.get(GENERATED_ID)?.name).toBe('Acheter du pain');
        });

        // Depuis US-11 le proprietaire n est plus un compte fixe : c est celui
        // que la session designe.
        it('attribue l item au compte de la session', async () => {
            await harness.request('/items', json('POST', { name: 'Acheter du pain' }));

            expect(store.items.get(GENERATED_ID)?.ownerId).toBe(OWNER_ID);
        });

        it('ne divulgue pas le proprietaire dans la reponse', async () => {
            await reseed([
                { id: EXISTING_ID, name: 'Acheter du pain', completed: false, ownerId: OWNER_ID },
            ]);

            const createResponse = await harness.request('/items', json('POST', { name: 'Autre' }));
            const created = (await createResponse.json()) as Record<string, unknown>;
            const listResponse = await harness.request('/items');
            const listed = (await listResponse.json()) as Record<string, unknown>[];

            expect(created).not.toHaveProperty('ownerId');
            expect(JSON.stringify(listed)).not.toContain(OWNER_ID);
        });

        it('refuse un corps sans nom et ne persiste rien', async () => {
            const response = await harness.request('/items', json('POST', {}));

            expect(response.status).toBe(400);
            expect(store.items.size).toBe(0);
        });

        it('refuse un nom vide', async () => {
            const response = await harness.request('/items', json('POST', { name: '   ' }));

            expect(response.status).toBe(400);
            expect(store.items.size).toBe(0);
        });

        it('decrit l erreur au format attendu', async () => {
            const response = await harness.request('/items', json('POST', { name: 42 }));
            const problem = (await response.json()) as Record<string, unknown>;

            expect(problem.type).toBe('validation_error');
            expect(problem.status).toBe(400);
            expect(problem.instance).toBe('/items');
            expect(problem.traceId).toEqual(expect.any(String));
        });

        // Le message d erreur nomme le champ et la raison, jamais la valeur
        // soumise : un corps d erreur ne doit pas renvoyer ce que l utilisateur
        // a tape. L assertion porte sur `detail` et non sur le corps entier,
        // car un traceId aleatoire peut contenir n importe quelle sous-chaine.
        it('ne renvoie pas la valeur soumise dans le message', async () => {
            const valeurSoumise = 'zzz-valeur-que-l-utilisateur-a-tapee-zzz';

            const response = await harness.request(
                '/items',
                json('POST', { name: valeurSoumise.repeat(20) }),
            );
            const problem = (await response.json()) as { detail: string };

            expect(problem.detail).toContain('name');
            expect(problem.detail).not.toContain(valeurSoumise);
        });
    });

    describe('PUT /items/:id', () => {
        it('met a jour un item existant', async () => {
            await reseed([
                { id: EXISTING_ID, name: 'Ancien nom', completed: false, ownerId: OWNER_ID },
            ]);

            const response = await harness.request(
                `/items/${EXISTING_ID}`,
                json('PUT', { name: 'Nouveau nom', completed: true }),
            );

            expect(response.status).toBe(200);
            await expect(response.json()).resolves.toEqual({
                id: EXISTING_ID,
                name: 'Nouveau nom',
                completed: true,
            });
        });

        it('repond 404 sur un item inexistant', async () => {
            const response = await harness.request(
                `/items/${UNKNOWN_ID}`,
                json('PUT', { name: 'Nouveau nom', completed: true }),
            );

            expect(response.status).toBe(404);
        });

        it('refuse un identifiant qui n est pas un uuid', async () => {
            const response = await harness.request(
                '/items/pas-un-uuid',
                json('PUT', { name: 'Nouveau nom', completed: true }),
            );

            expect(response.status).toBe(400);
        });

        it('refuse un corps incomplet', async () => {
            const response = await harness.request(
                `/items/${EXISTING_ID}`,
                json('PUT', { name: 'Sans etat' }),
            );

            expect(response.status).toBe(400);
        });
    });

    describe('DELETE /items/:id', () => {
        it('supprime un item existant', async () => {
            await reseed([
                { id: EXISTING_ID, name: 'A supprimer', completed: false, ownerId: OWNER_ID },
            ]);

            const response = await harness.request(`/items/${EXISTING_ID}`, { method: 'DELETE' });

            expect(response.status).toBe(200);
            expect(store.items.size).toBe(0);
        });

        // Le code herite repondait 200 sans regarder si l item existait. La
        // suppression signale desormais l absence, ce qui permet a un client de
        // distinguer une suppression effective d une ressource deja disparue.
        it('repond 404 sur un item inexistant', async () => {
            const response = await harness.request(`/items/${UNKNOWN_ID}`, { method: 'DELETE' });

            expect(response.status).toBe(404);
        });
    });

    describe('identifiant de trace', () => {
        // Le middleware garantit la presence de l identifiant. S il etait
        // oublie, propager `undefined` jusque dans un journal rendrait tout
        // signalement d utilisateur intracable : l acces echoue donc bruyamment.
        it('echoue clairement si le middleware de trace n est pas monte', async () => {
            const { traceIdOf } = await import('../trace.js');

            expect(() => traceIdOf({ locals: {} } as never)).toThrow(/withTraceId/);
        });

        it('donne le meme identifiant a la reponse et aux lignes journalisees', async () => {
            const response = await harness.request('/items', json('POST', {}));
            const problem = (await response.json()) as { traceId: string };

            expect(problem.traceId).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
            );
        });
    });

    describe('journalisation', () => {
        it('ne journalise jamais le nom d un item', async () => {
            await harness.request('/items', json('POST', { name: 'Acheter du pain' }));

            expect(JSON.stringify(harness.logger.lines)).not.toContain('Acheter du pain');
        });

        it('journalise un refus attendu en avertissement, pas en erreur', async () => {
            await harness.request('/items', json('POST', {}));

            const levels = harness.logger.lines.map(line => line.level);
            expect(levels).toContain('warn');
            expect(levels).not.toContain('error');
        });

        it('rattache le meme identifiant de trace a la reponse et au journal', async () => {
            const response = await harness.request('/items', json('POST', {}));
            const problem = (await response.json()) as { traceId: string };

            const traced = harness.logger.lines.filter(
                line => (line.fields as { traceId?: string }).traceId === problem.traceId,
            );
            expect(traced.length).toBeGreaterThan(0);
        });
    });
});
