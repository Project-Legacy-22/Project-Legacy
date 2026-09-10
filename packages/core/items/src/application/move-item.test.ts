import { describe, expect, it } from 'vitest';

import { anItem } from '../../test/builders/item.js';
import { inMemoryItemRepository } from '../../test/fakes/in-memory-item-repository.js';
import { ItemNotFound, ItemStatusConflict } from '../domain/item.js';
import { makeMoveItem } from './move-item.js';

const OWNER_ID = 'owner-42';
const OTHER_OWNER_ID = 'owner-7';
const PROJECT_ID = 'project-1';

describe('moveItem', () => {
    it('deplace la tache et incremente sa version', async () => {
        const repository = inMemoryItemRepository([
            anItem({ id: 'item-1', projectId: PROJECT_ID, ownerId: OWNER_ID }),
        ]);
        const moveItem = makeMoveItem(repository);

        const moved = await moveItem({
            id: 'item-1',
            projectId: PROJECT_ID,
            memberId: OWNER_ID,
            status: 'doing',
            expectedVersion: 1,
        });

        expect(moved).toMatchObject({ status: 'doing', version: 2 });
        expect(repository.items.get('item-1')).toEqual(moved);
    });

    it('traite une tache inaccessible comme une tache inexistante', async () => {
        const theirs = anItem({ id: 'item-1', projectId: PROJECT_ID, ownerId: OTHER_OWNER_ID });
        const repository = inMemoryItemRepository([theirs]);
        const moveItem = makeMoveItem(repository);

        const result = moveItem({
            id: 'item-1',
            projectId: PROJECT_ID,
            memberId: OWNER_ID,
            status: 'done',
            expectedVersion: 1,
        });

        await expect(result).rejects.toBeInstanceOf(ItemNotFound);
        expect(repository.items.get('item-1')).toEqual(theirs);
    });

    it('refuse une version perimee sans ecraser le dernier deplacement', async () => {
        const current = anItem({
            id: 'item-1',
            projectId: PROJECT_ID,
            ownerId: OWNER_ID,
            status: 'doing',
            version: 2,
        });
        const repository = inMemoryItemRepository([current]);
        const moveItem = makeMoveItem(repository);

        const result = moveItem({
            id: 'item-1',
            projectId: PROJECT_ID,
            memberId: OWNER_ID,
            status: 'done',
            expectedVersion: 1,
        });

        await expect(result).rejects.toBeInstanceOf(ItemStatusConflict);
        expect(repository.items.get('item-1')).toEqual(current);
    });
});
