import { describe, expect, it } from 'vitest';

import { failingItemRepository, inMemoryItemRepository } from '../../test/fakes/in-memory-item-repository.js';
import type { InMemoryItemRepository } from '../../test/fakes/in-memory-item-repository.js';
import { ITEM_CREATED_V1 } from '../domain/event.js';
import { InvalidItemName } from '../domain/item.js';
import { makeAddItem } from './add-item.js';

const OWNER_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_OWNER_ID = '00000000-0000-7000-8000-000000000002';
const PROJECT_ID = '00000000-0000-7000-8000-000000000010';
const NOW = new Date('2026-09-04T10:00:00.000Z');

// Two distinct identifiers: the item's, then the event's. A constant generator would confuse them
// and hide a swap.
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
    it('persists an item with the injected id and the given owner', async () => {
        const repository = inMemoryItemRepository([], [{ projectId: PROJECT_ID, userId: OWNER_ID }]);

        const item = await addItemWith(repository)({ name: 'Buy milk', projectId: PROJECT_ID, ownerId: OWNER_ID });

        expect(item).toEqual({
            id: 'item-id',
            position: 'item-id',
            name: 'Buy milk',
            status: 'todo',
            version: 1,
            priority: 'normal',
            dueDate: null,
            projectId: PROJECT_ID,
            ownerId: OWNER_ID,
            assigneeIds: [],
        });
        expect(await repository.findByIdForMember('item-id', PROJECT_ID, OWNER_ID)).toEqual(item);
    });

    it('persists optional planning values, including a past due date', async () => {
        const repository = inMemoryItemRepository([], [{ projectId: PROJECT_ID, userId: OWNER_ID }]);

        const item = await addItemWith(repository)({
            name: 'Buy milk',
            projectId: PROJECT_ID,
            ownerId: OWNER_ID,
            priority: 'high',
            dueDate: '2020-01-02',
        });

        expect(item).toMatchObject({ priority: 'high', dueDate: '2020-01-02' });
        expect(repository.items.get(item.id)).toEqual(item);
    });

    // The owner comes from the caller: two different callers do not produce items of the same
    // owner.
    it('gives the item to the caller and not to a fixed account', async () => {
        const repository = inMemoryItemRepository([], [{ projectId: PROJECT_ID, userId: OTHER_OWNER_ID }]);

        const item = await addItemWith(repository)({
            name: 'Buy milk',
            projectId: PROJECT_ID,
            ownerId: OTHER_OWNER_ID,
        });

        expect(item.ownerId).toBe(OTHER_OWNER_ID);
    });

    it('announces the creation with a versioned event', async () => {
        const repository = inMemoryItemRepository([], [{ projectId: PROJECT_ID, userId: OWNER_ID }]);

        await addItemWith(repository)({ name: 'Buy milk', projectId: PROJECT_ID, ownerId: OWNER_ID });

        expect(repository.recordedEvents).toEqual([
            {
                id: 'event-id',
                name: ITEM_CREATED_V1,
                occurredAt: NOW.toISOString(),
                payload: { itemId: 'item-id', ownerId: OWNER_ID },
            },
        ]);
    });

    it('refuses an empty title without touching the repository', async () => {
        const repository = inMemoryItemRepository([], [{ projectId: PROJECT_ID, userId: OWNER_ID }]);

        await expect(
            addItemWith(repository)({ name: '   ', projectId: PROJECT_ID, ownerId: OWNER_ID }),
        ).rejects.toBeInstanceOf(InvalidItemName);
        expect(repository.items.size).toBe(0);
        expect(repository.recordedEvents).toHaveLength(0);
    });

    // The US-10 criterion: if saving the task fails, no event is published. With a single atomic
    // call, there is no window during which the event could have left alone.
    it('announces nothing when saving fails', async () => {
        const repository = failingItemRepository('storage unavailable', [{ projectId: PROJECT_ID, userId: OWNER_ID }]);

        await expect(
            addItemWith(repository)({ name: 'Buy milk', projectId: PROJECT_ID, ownerId: OWNER_ID }),
        ).rejects.toThrow('storage unavailable');
        expect(repository.recordedEvents).toHaveLength(0);
    });
});
