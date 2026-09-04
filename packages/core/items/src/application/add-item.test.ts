import { describe, expect, it } from 'vitest';

import {
    failingItemRepository,
    inMemoryItemRepository,
} from '../../test/fakes/in-memory-item-repository.js';
import type { InMemoryItemRepository } from '../../test/fakes/in-memory-item-repository.js';
import { ITEM_CREATED_V1 } from '../domain/event.js';
import { InvalidItemName } from '../domain/item.js';
import { makeAddItem } from './add-item.js';

const OWNER_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_OWNER_ID = '00000000-0000-7000-8000-000000000002';
const NOW = new Date('2026-09-04T10:00:00.000Z');

// Deux identifiants distincts : celui de l item, puis celui de l evenement. Un
// generateur constant les confondrait et masquerait une inversion.
function identifiers(...values: string[]): () => string {
    const remaining = [...values];
    return () => remaining.shift() ?? 'epuise';
}

function addItemWith(repository: InMemoryItemRepository) {
    return makeAddItem({
        repository,
        newId: identifiers('item-id', 'event-id'),
        now: () => NOW,
    });
}

describe('addItem', () => {
    it('persiste un item avec l id injecte et le proprietaire fourni', async () => {
        const repository = inMemoryItemRepository();

        const item = await addItemWith(repository)('Buy milk', OWNER_ID);

        expect(item).toEqual({
            id: 'item-id',
            name: 'Buy milk',
            completed: false,
            ownerId: OWNER_ID,
        });
        expect(await repository.findById('item-id')).toEqual(item);
    });

    // Le proprietaire vient de l appelant : deux appelants differents ne
    // produisent pas des items du meme proprietaire.
    it('attribue l item a l appelant et pas a un compte fixe', async () => {
        const repository = inMemoryItemRepository();

        const item = await addItemWith(repository)('Buy milk', OTHER_OWNER_ID);

        expect(item.ownerId).toBe(OTHER_OWNER_ID);
    });

    it('annonce la creation par un evenement versionne', async () => {
        const repository = inMemoryItemRepository();

        await addItemWith(repository)('Buy milk', OWNER_ID);

        expect(repository.recordedEvents).toEqual([
            {
                id: 'event-id',
                name: ITEM_CREATED_V1,
                occurredAt: NOW.toISOString(),
                payload: { itemId: 'item-id', ownerId: OWNER_ID },
            },
        ]);
    });

    it('refuse un titre vide sans toucher au depot', async () => {
        const repository = inMemoryItemRepository();

        await expect(addItemWith(repository)('   ', OWNER_ID)).rejects.toBeInstanceOf(
            InvalidItemName,
        );
        expect(await repository.findAll()).toHaveLength(0);
        expect(repository.recordedEvents).toHaveLength(0);
    });

    // Le critere de US-10 : si l enregistrement de la tache echoue, aucun
    // evenement n est publie. Avec un seul appel atomique, il n existe aucune
    // fenetre pendant laquelle l evenement aurait pu partir seul.
    it('n annonce rien quand l enregistrement echoue', async () => {
        const repository = failingItemRepository();

        await expect(addItemWith(repository)('Buy milk', OWNER_ID)).rejects.toThrow(
            'storage unavailable',
        );
        expect(repository.recordedEvents).toHaveLength(0);
    });
});
