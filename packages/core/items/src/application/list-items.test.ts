import { describe, expect, it } from 'vitest';

import { inMemoryItemRepository } from '../../test/fakes/in-memory-item-repository.js';
import { anItem } from '../../test/builders/item.js';
import { makeListItems } from './list-items.js';

describe('listItems', () => {
    it('renvoie les items persistes', async () => {
        const items = [anItem({ id: 'item-1' }), anItem({ id: 'item-2' })];
        const listItems = makeListItems(inMemoryItemRepository(items));

        await expect(listItems()).resolves.toEqual(items);
    });

    it('renvoie une liste vide quand le depot est vide', async () => {
        const listItems = makeListItems(inMemoryItemRepository());

        await expect(listItems()).resolves.toEqual([]);
    });
});
