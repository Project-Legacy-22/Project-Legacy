import { describe, expect, it } from 'vitest';

import { inMemoryItemRepository } from '../../test/fakes/in-memory-item-repository.js';
import { anItem } from '../../test/builders/item.js';
import { ItemNotFound } from '../domain/item.js';
import { makeRemoveItem } from './remove-item.js';

const OWNER_ID = 'owner-1';
const OTHER_OWNER_ID = 'owner-2';
const PROJECT_ID = 'project-1';

describe('removeItem', () => {
    it('retire un item du depot a la demande de son proprietaire', async () => {
        const repository = inMemoryItemRepository([anItem({ id: 'item-1', projectId: PROJECT_ID, ownerId: OWNER_ID })]);
        const removeItem = makeRemoveItem(repository);

        await removeItem('item-1', PROJECT_ID, OWNER_ID);

        expect(await repository.findByIdForMember('item-1', PROJECT_ID, OWNER_ID)).toBeUndefined();
    });

    it('rejette un item introuvable', async () => {
        const removeItem = makeRemoveItem(inMemoryItemRepository());

        await expect(removeItem('missing', PROJECT_ID, OWNER_ID)).rejects.toBeInstanceOf(ItemNotFound);
    });

    it('traite l item d un autre compte comme inexistant et le laisse en place', async () => {
        const theirs = anItem({
            id: 'item-1',
            projectId: PROJECT_ID,
            ownerId: OTHER_OWNER_ID,
        });
        const repository = inMemoryItemRepository([theirs]);
        const removeItem = makeRemoveItem(repository);

        expect(await repository.findByIdForMember('item-1', PROJECT_ID, OTHER_OWNER_ID)).toEqual(theirs);

        const result = removeItem('item-1', PROJECT_ID, OWNER_ID);

        await expect(result).rejects.toBeInstanceOf(ItemNotFound);
        expect(await repository.findByIdForMember('item-1', PROJECT_ID, OTHER_OWNER_ID)).toEqual(theirs);
    });
});
