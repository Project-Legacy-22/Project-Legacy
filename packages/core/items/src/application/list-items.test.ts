import { describe, expect, it } from 'vitest';

import { inMemoryItemRepository } from '../../test/fakes/in-memory-item-repository.js';
import { anItem } from '../../test/builders/item.js';
import { makeListItems } from './list-items.js';

const OWNER_ID = 'owner-1';
const OTHER_OWNER_ID = 'owner-2';
const PROJECT_ID = 'project-1';
const OTHER_PROJECT_ID = 'project-2';
const FIRST_PAGE = { limit: 10, cursor: undefined };

function threeItemsOf(ownerId: string) {
    return [
        anItem({ id: 'item-1', projectId: PROJECT_ID, ownerId }),
        anItem({ id: 'item-2', projectId: PROJECT_ID, ownerId }),
        anItem({ id: 'item-3', projectId: PROJECT_ID, ownerId }),
    ];
}

describe('listItems', () => {
    it('ne renvoie que les items du proprietaire demande', async () => {
        const mine = anItem({
            id: 'item-1',
            projectId: PROJECT_ID,
            ownerId: OWNER_ID,
        });
        const theirs = anItem({
            id: 'item-2',
            projectId: OTHER_PROJECT_ID,
            ownerId: OTHER_OWNER_ID,
        });
        const listItems = makeListItems(inMemoryItemRepository([mine, theirs]));

        const page = await listItems(PROJECT_ID, OWNER_ID, FIRST_PAGE);

        // Le sien est present autant que celui de l autre est absent : sans
        // quoi un filtre qui ne renvoie jamais rien passerait ce test.
        expect(page.items).toEqual([mine]);
    });

    it('renvoie une page vide quand le depot est vide', async () => {
        const listItems = makeListItems(inMemoryItemRepository([], [{ projectId: PROJECT_ID, userId: OWNER_ID }]));

        await expect(listItems(PROJECT_ID, OWNER_ID, FIRST_PAGE)).resolves.toEqual({
            items: [],
            nextCursor: undefined,
        });
    });

    it('sert la liste page par page sans repeter ni sauter un item', async () => {
        const listItems = makeListItems(inMemoryItemRepository(threeItemsOf(OWNER_ID)));

        const first = await listItems(PROJECT_ID, OWNER_ID, {
            limit: 2,
            cursor: undefined,
        });
        const second = await listItems(PROJECT_ID, OWNER_ID, {
            limit: 2,
            cursor: first.nextCursor,
        });

        expect(first.items.map((item) => item.id)).toEqual(['item-1', 'item-2']);
        expect(second.items.map((item) => item.id)).toEqual(['item-3']);
        expect(second.nextCursor).toBeUndefined();
    });

    it('orders priority, then due date, then id reproducibly', async () => {
        const listItems = makeListItems(inMemoryItemRepository([
            anItem({ id: 'item-4', priority: 'normal', dueDate: null, projectId: PROJECT_ID, ownerId: OWNER_ID }),
            anItem({ id: 'item-3', priority: 'high', dueDate: '2026-09-20', projectId: PROJECT_ID, ownerId: OWNER_ID }),
            anItem({ id: 'item-2', priority: 'high', dueDate: '2026-09-12', projectId: PROJECT_ID, ownerId: OWNER_ID }),
            anItem({ id: 'item-1', priority: 'high', dueDate: '2026-09-12', projectId: PROJECT_ID, ownerId: OWNER_ID }),
        ]));

        const page = await listItems(PROJECT_ID, OWNER_ID, FIRST_PAGE);

        expect(page.items.map((item) => item.id)).toEqual(['item-1', 'item-2', 'item-3', 'item-4']);
    });

    it('permet a un membre de lire les items crees par un autre compte', async () => {
        const shared = anItem({ projectId: PROJECT_ID, ownerId: OTHER_OWNER_ID });
        const repository = inMemoryItemRepository([shared], [{ projectId: PROJECT_ID, userId: OWNER_ID }]);

        const page = await makeListItems(repository)(PROJECT_ID, OWNER_ID, FIRST_PAGE);

        expect(page.items).toEqual([shared]);
    });

    it('traite un non-membre comme un projet inexistant', async () => {
        const repository = inMemoryItemRepository([anItem({ projectId: PROJECT_ID, ownerId: OTHER_OWNER_ID })]);

        await expect(makeListItems(repository)(PROJECT_ID, OWNER_ID, FIRST_PAGE)).rejects.toMatchObject({
            code: 'project_not_found',
            httpStatus: 404,
        });
        await expect(makeListItems(repository)('missing-project', OWNER_ID, FIRST_PAGE)).rejects.toMatchObject({
            code: 'project_not_found',
            httpStatus: 404,
        });
    });
});
