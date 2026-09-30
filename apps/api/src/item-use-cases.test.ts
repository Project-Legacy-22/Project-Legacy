import { describe, expect, it, vi } from 'vitest';

import { recordingLogger } from '../../../packages/contracts/test/fakes/recording-logger.js';
import { inMemoryItemRepository } from '../../../packages/core/items/test/fakes/in-memory-item-repository.js';
import { itemUseCases } from './composition-root.js';

const PROJET = '01a090ad-a932-739f-b358-60b7eb289a40';
const PROPRIETAIRE = '00000000-0000-7000-8000-000000000001';

// Where the delivery trigger lives, and where it does not.
//
// It was first set on reading the notifications: a read path carried infrastructure work, and an
// event stayed undelivered until its recipient came to look. It now lives on the write, which is
// the only event producer.

describe('the task use cases', () => {
    it('deliver after a creation', async () => {
        const deliver = vi.fn(async () => undefined);
        const store = inMemoryItemRepository([], [{ projectId: PROJET, userId: PROPRIETAIRE }]);

        const useCases = itemUseCases(store, deliver, recordingLogger());
        await useCases.addItem({ projectId: PROJET, name: 'Une tache', ownerId: PROPRIETAIRE });

        expect(deliver).toHaveBeenCalledTimes(1);
    });

    it('do not deliver on a read', async () => {
        const deliver = vi.fn(async () => undefined);
        const store = inMemoryItemRepository([], [{ projectId: PROJET, userId: PROPRIETAIRE }]);

        const useCases = itemUseCases(store, deliver, recordingLogger());
        await useCases.listItems(PROJET, PROPRIETAIRE, { limit: 10, cursor: undefined });

        expect(deliver).not.toHaveBeenCalled();
    });
});
