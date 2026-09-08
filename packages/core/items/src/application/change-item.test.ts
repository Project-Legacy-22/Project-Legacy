import { describe, expect, it } from 'vitest';

import { inMemoryItemRepository } from '../../test/fakes/in-memory-item-repository.js';
import { anItem } from '../../test/builders/item.js';
import { InvalidItemName, ItemNotFound } from '../domain/item.js';
import { makeChangeItem } from './change-item.js';

const OWNER_ID = 'owner-42';
const OTHER_OWNER_ID = 'owner-7';
const PROJECT_ID = 'project-1';

describe('changeItem', () => {
    it('met a jour le nom et l etat termine sans changer le proprietaire', async () => {
        const existing = anItem({
            id: 'item-1',
            name: 'Old name',
            completed: false,
            projectId: PROJECT_ID,
            ownerId: OWNER_ID,
        });
        const repository = inMemoryItemRepository([existing]);
        const changeItem = makeChangeItem(repository);

        const updated = await changeItem({
            id: 'item-1',
            projectId: PROJECT_ID,
            memberId: OWNER_ID,
            changes: { name: 'New name', completed: true },
        });

        expect(updated).toEqual({
            id: 'item-1',
            name: 'New name',
            completed: true,
            projectId: PROJECT_ID,
            ownerId: OWNER_ID,
        });
        expect(await repository.findByIdForMember('item-1', PROJECT_ID, OWNER_ID)).toEqual(updated);
    });

    it('rejette un item introuvable', async () => {
        const repository = inMemoryItemRepository();
        const changeItem = makeChangeItem(repository);

        const result = changeItem({
            id: 'missing',
            projectId: PROJECT_ID,
            memberId: OWNER_ID,
            changes: { name: 'New name', completed: true },
        });

        await expect(result).rejects.toBeInstanceOf(ItemNotFound);
    });

    it('traite l item d un autre compte comme inexistant et le laisse intact', async () => {
        const theirs = anItem({
            id: 'item-1',
            name: 'Old name',
            projectId: PROJECT_ID,
            ownerId: OTHER_OWNER_ID,
        });
        const repository = inMemoryItemRepository([theirs]);
        const changeItem = makeChangeItem(repository);

        const result = changeItem({
            id: 'item-1',
            projectId: PROJECT_ID,
            memberId: OWNER_ID,
            changes: { name: 'New name', completed: true },
        });

        // Le refus est celui d un item inexistant, et rien n a bouge : une
        // reponse differente de celle de l item inconnu confirmerait a
        // l appelant que cet identifiant designe bien quelque chose.
        await expect(result).rejects.toBeInstanceOf(ItemNotFound);
        expect(await repository.findByIdForMember('item-1', PROJECT_ID, OTHER_OWNER_ID)).toEqual(theirs);
    });

    it('refuse un nom vide sans modifier l item existant', async () => {
        const existing = anItem({
            id: 'item-1',
            name: 'Old name',
            projectId: PROJECT_ID,
            ownerId: OWNER_ID,
        });
        const repository = inMemoryItemRepository([existing]);
        const changeItem = makeChangeItem(repository);

        const result = changeItem({
            id: 'item-1',
            projectId: PROJECT_ID,
            memberId: OWNER_ID,
            changes: { name: '   ', completed: true },
        });

        await expect(result).rejects.toBeInstanceOf(InvalidItemName);
        expect(await repository.findByIdForMember('item-1', PROJECT_ID, OWNER_ID)).toEqual(existing);
    });
});
