import { describe, expect, it } from 'vitest';

import { inMemoryItemRepository } from '../../test/fakes/in-memory-item-repository.js';
import { anItem } from '../../test/builders/item.js';
import { makeListItems } from './list-items.js';

const OWNER_ID = 'owner-1';
const OTHER_OWNER_ID = 'owner-2';
const FIRST_PAGE = { limit: 10, cursor: undefined };

function threeItemsOf(ownerId: string) {
    return [
        anItem({ id: 'item-1', ownerId }),
        anItem({ id: 'item-2', ownerId }),
        anItem({ id: 'item-3', ownerId }),
    ];
}

describe('listItems', () => {
    it('ne renvoie que les items du proprietaire demande', async () => {
        const mine = anItem({ id: 'item-1', ownerId: OWNER_ID });
        const theirs = anItem({ id: 'item-2', ownerId: OTHER_OWNER_ID });
        const listItems = makeListItems(inMemoryItemRepository([mine, theirs]));

        const page = await listItems(OWNER_ID, FIRST_PAGE);

        // Le sien est present autant que celui de l autre est absent : sans
        // quoi un filtre qui ne renvoie jamais rien passerait ce test.
        expect(page.items).toEqual([mine]);
    });

    it('renvoie une page vide quand le depot est vide', async () => {
        const listItems = makeListItems(inMemoryItemRepository());

        await expect(listItems(OWNER_ID, FIRST_PAGE)).resolves.toEqual({
            items: [],
            nextCursor: undefined,
        });
    });

    it('sert la liste page par page sans repeter ni sauter un item', async () => {
        const listItems = makeListItems(inMemoryItemRepository(threeItemsOf(OWNER_ID)));

        const first = await listItems(OWNER_ID, { limit: 2, cursor: undefined });
        const second = await listItems(OWNER_ID, { limit: 2, cursor: first.nextCursor });

        expect(first.items.map(item => item.id)).toEqual(['item-3', 'item-2']);
        expect(second.items.map(item => item.id)).toEqual(['item-1']);
        expect(second.nextCursor).toBeUndefined();
    });
});
