import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { makeAddItem, makeChangeItem, makeListItems, makeRemoveItem } from '@legacy/core-items';
import type { Item, ItemRepository } from '@legacy/core-items';

import { createServer } from '../server.js';
import type { Config } from '../../config.js';
import type { ItemUseCases } from '../../composition-root.js';
import { recordingLogger } from '../../../test/fakes/recording-logger.js';
import type { RecordingLogger } from '../../../test/fakes/recording-logger.js';

const GENERATED_ID = '33333333-3333-4333-8333-333333333333';
// The single-user system account items are owned by until US-11. It is an
// internal fact: the assertions below check it never reaches a response.
const OWNER_ID = '00000000-0000-7000-8000-000000000001';

// The routes are exercised over real HTTP rather than by calling a handler with
// a hand-made req/res pair. Status codes, response shapes and the error
// middleware's output are the contract clients depend on; calling the handler
// directly would assert the code's shape instead of that contract.

interface Harness {
    request: (path: string, init?: RequestInit) => Promise<Response>;
    close: () => Promise<void>;
    logger: RecordingLogger;
}

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

function useCasesOver(repository: ItemRepository): ItemUseCases {
    return {
        listItems: makeListItems(repository),
        addItem: makeAddItem({ repository, newId: () => GENERATED_ID, ownerId: () => OWNER_ID }),
        changeItem: makeChangeItem(repository),
        removeItem: makeRemoveItem(repository),
    };
}

// Port 0 lets the operating system pick a free port, so a test never collides
// with a running dev server or with another test.
async function start(app: Express, logger: RecordingLogger): Promise<Harness> {
    const server = createHttpServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${String(port)}`;

    return {
        logger,
        request: (path, init) => fetch(`${origin}${path}`, init),
        close: () =>
            new Promise<void>((resolve, reject) => {
                server.close(error => {
                    if (error) reject(error);
                    else resolve();
                });
            }),
    };
}

// Identifiers are UUIDs by contract (packages/contracts ItemIdParams), so the
// fixtures use real ones: a readable string such as 'item-1' would be rejected
// at the boundary, and the test would prove nothing about the route behind it.
const EXISTING_ID = '11111111-1111-4111-8111-111111111111';
const UNKNOWN_ID = '22222222-2222-4222-8222-222222222222';

function json(method: string, body: unknown): RequestInit {
    return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

const config: Config = {
    port: 0,
    // No directory is served here: only the API contract is under test.
    staticDir: import.meta.dirname,
    // The repository is a fake, so these are never dialled: they only satisfy
    // the type.
    supabaseUrl: 'http://127.0.0.1:54321',
    supabaseServiceRoleKey: 'test-service-role-key',
    // Le journal de ce test est capture par un logger d essai ; le niveau ne
    // sert qu a satisfaire le type.
    logLevel: 'info',
};

describe('items API', () => {
    let harness: Harness;
    let store: Store;

    async function serve(seed: Item[] = []): Promise<void> {
        store = inMemoryStore(seed);
        const logger = recordingLogger();
        harness = await start(createServer(config, useCasesOver(store.repository), logger), logger);
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
