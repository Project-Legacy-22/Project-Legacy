import { describe, expect, it, vi } from 'vitest';

import { recordingLogger } from '../../../packages/contracts/test/fakes/recording-logger.js';
import { inMemoryItemRepository } from '../../../packages/core/items/test/fakes/in-memory-item-repository.js';
import { itemUseCases } from './composition-root.js';

const PROJET = '01a090ad-a932-739f-b358-60b7eb289a40';
const PROPRIETAIRE = '00000000-0000-7000-8000-000000000001';

// Ou vit le declencheur de livraison, et ou il ne vit pas.
//
// Il etait d abord pose sur la lecture des notifications : un chemin de lecture
// portait du travail d infrastructure, et un evenement restait non livre
// jusqu a ce que son destinataire vienne regarder. Il vit maintenant sur
// l ecriture, qui est le seul producteur d evenement.

describe('les cas d usage des taches', () => {
    it('livrent apres une creation', async () => {
        const deliver = vi.fn(async () => undefined);
        const store = inMemoryItemRepository([], [{ projectId: PROJET, userId: PROPRIETAIRE }]);

        const useCases = itemUseCases(store, deliver, recordingLogger());
        await useCases.addItem({ projectId: PROJET, name: 'Une tache', ownerId: PROPRIETAIRE });

        expect(deliver).toHaveBeenCalledTimes(1);
    });

    it('ne livrent pas sur une lecture', async () => {
        const deliver = vi.fn(async () => undefined);
        const store = inMemoryItemRepository([], [{ projectId: PROJET, userId: PROPRIETAIRE }]);

        const useCases = itemUseCases(store, deliver, recordingLogger());
        await useCases.listItems(PROJET, PROPRIETAIRE, { limit: 10, cursor: undefined });

        expect(deliver).not.toHaveBeenCalled();
    });
});
