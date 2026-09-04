import { describe, expect, it } from 'vitest';

import { inMemoryItemRepository } from '../../test/fakes/in-memory-item-repository.js';
import { InvalidItemName } from '../domain/item.js';
import { makeAddItem } from './add-item.js';

const OWNER_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_OWNER_ID = '00000000-0000-7000-8000-000000000002';

describe('addItem', () => {
    it('persiste un item avec l id injecte et le proprietaire fourni', async () => {
        const repository = inMemoryItemRepository();
        const addItem = makeAddItem({ repository, newId: () => 'generated-id' });

        const item = await addItem('Buy milk', OWNER_ID);

        expect(item).toEqual({
            id: 'generated-id',
            name: 'Buy milk',
            completed: false,
            ownerId: OWNER_ID,
        });
        expect(await repository.findById('generated-id')).toEqual(item);
    });

    // Le proprietaire vient de l appelant : deux appelants differents ne
    // produisent pas des items du meme proprietaire.
    it('attribue l item a l appelant et pas a un compte fixe', async () => {
        const repository = inMemoryItemRepository();
        const addItem = makeAddItem({ repository, newId: () => 'generated-id' });

        const item = await addItem('Buy milk', OTHER_OWNER_ID);

        expect(item.ownerId).toBe(OTHER_OWNER_ID);
    });

    it('refuse un titre vide sans toucher au depot', async () => {
        const repository = inMemoryItemRepository();
        const addItem = makeAddItem({ repository, newId: () => 'generated-id' });

        await expect(addItem('   ', OWNER_ID)).rejects.toBeInstanceOf(InvalidItemName);
        expect(await repository.findAll()).toHaveLength(0);
    });
});
