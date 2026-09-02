import { describe, expect, it } from 'vitest';

import { inMemoryItemRepository } from '../../test/fakes/in-memory-item-repository.js';
import { InvalidItemName } from '../domain/item.js';
import { makeAddItem } from './add-item.js';

describe('addItem', () => {
    it('persiste un item avec l id fourni par le generateur injecte', async () => {
        const repository = inMemoryItemRepository();
        const addItem = makeAddItem({ repository, newId: () => 'generated-id' });

        const item = await addItem('Buy milk');

        expect(item).toEqual({ id: 'generated-id', name: 'Buy milk', completed: false });
        expect(await repository.findById('generated-id')).toEqual(item);
    });

    it('refuse un titre vide sans toucher au depot', async () => {
        const repository = inMemoryItemRepository();
        const addItem = makeAddItem({ repository, newId: () => 'generated-id' });

        await expect(addItem('   ')).rejects.toBeInstanceOf(InvalidItemName);
        expect(await repository.findAll()).toHaveLength(0);
    });
});
