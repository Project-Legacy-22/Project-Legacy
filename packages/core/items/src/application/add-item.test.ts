import { describe, expect, it } from 'vitest';

import { inMemoryItemRepository } from '../../test/fakes/in-memory-item-repository.js';
import { InvalidItemName } from '../domain/item.js';
import { makeAddItem } from './add-item.js';

const OWNER_ID = '00000000-0000-7000-8000-000000000001';

describe('addItem', () => {
    it('persiste un item avec l id et le proprietaire fournis par les generateurs injectes', async () => {
        const repository = inMemoryItemRepository();
        const addItem = makeAddItem({
            repository,
            newId: () => 'generated-id',
            ownerId: () => OWNER_ID,
        });

        const item = await addItem('Buy milk');

        expect(item).toEqual({
            id: 'generated-id',
            name: 'Buy milk',
            completed: false,
            ownerId: OWNER_ID,
        });
        expect(await repository.findById('generated-id')).toEqual(item);
    });

    it('refuse un titre vide sans toucher au depot', async () => {
        const repository = inMemoryItemRepository();
        const addItem = makeAddItem({
            repository,
            newId: () => 'generated-id',
            ownerId: () => OWNER_ID,
        });

        await expect(addItem('   ')).rejects.toBeInstanceOf(InvalidItemName);
        expect(await repository.findAll()).toHaveLength(0);
    });
});
