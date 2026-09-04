import { describe, expect, it } from 'vitest';

import { inMemoryItemRepository } from '../../test/fakes/in-memory-item-repository.js';
import { anItem } from '../../test/builders/item.js';
import { InvalidItemName, ItemNotFound } from '../domain/item.js';
import { makeChangeItem } from './change-item.js';

describe('changeItem', () => {
    it('met a jour le nom et l etat termine sans changer le proprietaire', async () => {
        const existing = anItem({
            id: 'item-1',
            name: 'Old name',
            completed: false,
            ownerId: 'owner-42',
        });
        const repository = inMemoryItemRepository([existing]);
        const changeItem = makeChangeItem(repository);

        const updated = await changeItem('item-1', { name: 'New name', completed: true });

        expect(updated).toEqual({
            id: 'item-1',
            name: 'New name',
            completed: true,
            ownerId: 'owner-42',
        });
        expect(await repository.findById('item-1')).toEqual(updated);
    });

    it('rejette un item introuvable', async () => {
        const repository = inMemoryItemRepository();
        const changeItem = makeChangeItem(repository);

        const result = changeItem('missing', { name: 'New name', completed: true });

        await expect(result).rejects.toBeInstanceOf(ItemNotFound);
    });

    it('refuse un nom vide sans modifier l item existant', async () => {
        const existing = anItem({ id: 'item-1', name: 'Old name', completed: false });
        const repository = inMemoryItemRepository([existing]);
        const changeItem = makeChangeItem(repository);

        const result = changeItem('item-1', { name: '   ', completed: true });

        await expect(result).rejects.toBeInstanceOf(InvalidItemName);
        expect(await repository.findById('item-1')).toEqual(existing);
    });
});
