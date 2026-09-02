import { describe, expect, it } from 'vitest';

import { inMemoryItemRepository } from '../../test/fakes/in-memory-item-repository.js';
import { anItem } from '../../test/builders/item.js';
import { ItemNotFound } from '../domain/item.js';
import { makeRemoveItem } from './remove-item.js';

describe('removeItem', () => {
    it('retire un item existant du depot', async () => {
        const repository = inMemoryItemRepository([anItem({ id: 'item-1' })]);
        const removeItem = makeRemoveItem(repository);

        await removeItem('item-1');

        expect(await repository.findById('item-1')).toBeUndefined();
    });

    it('rejette un item introuvable', async () => {
        const removeItem = makeRemoveItem(inMemoryItemRepository());

        await expect(removeItem('missing')).rejects.toBeInstanceOf(ItemNotFound);
    });
});
