import { describe, expect, it } from 'vitest';

import { InvalidItemPosition, ItemNotFound, ItemPositionConflict } from '../domain/item.js';
import { inMemoryItemRepository } from '../../test/fakes/in-memory-item-repository.js';
import { anItem } from '../../test/builders/item.js';
import { makeReorderItem } from './reorder-item.js';

const PROJECT_ID = 'project-1';
const MEMBER_ID = 'member-1';
const FIRST_ID = '00000000-0000-7000-8000-000000000011';
const SECOND_ID = '00000000-0000-7000-8000-000000000012';
const THIRD_ID = '00000000-0000-7000-8000-000000000013';

function items() {
    return [FIRST_ID, SECOND_ID, THIRD_ID].map((id) => anItem({
        id,
        projectId: PROJECT_ID,
        ownerId: MEMBER_ID,
    }));
}

function request(id = SECOND_ID, position = FIRST_ID, expectedVersion = 1) {
    return { id, projectId: PROJECT_ID, memberId: MEMBER_ID, position, expectedVersion };
}

describe('reorderItem', () => {
    it('swaps adjacent positions without changing status or the existing sort group', async () => {
        const repository = inMemoryItemRepository(items());
        const reorder = makeReorderItem(repository);

        const moved = await reorder(request());
        const page = await repository.findPageForMember(PROJECT_ID, MEMBER_ID, { limit: 10, cursor: undefined });

        expect(moved).toMatchObject({ id: SECOND_ID, status: 'todo', position: FIRST_ID, version: 2 });
        expect(page?.items.map((item) => item.id)).toEqual([SECOND_ID, FIRST_ID, THIRD_ID]);
        expect(repository.items.get(FIRST_ID)).toMatchObject({ position: SECOND_ID, version: 2 });
    });

    it('returns the same absence for an outsider and a missing task', async () => {
        const repository = inMemoryItemRepository(items());
        const reorder = makeReorderItem(repository);

        await expect(reorder({ ...request(), memberId: 'outsider' })).rejects.toBeInstanceOf(ItemNotFound);
        await expect(reorder(request('00000000-0000-7000-8000-000000000099'))).rejects.toBeInstanceOf(ItemNotFound);
    });

    it('rejects a position outside the adjacent ordering group without changing either task', async () => {
        const repository = inMemoryItemRepository(items());
        const reorder = makeReorderItem(repository);

        await expect(reorder(request(FIRST_ID, THIRD_ID))).rejects.toBeInstanceOf(InvalidItemPosition);
        expect(repository.items.get(FIRST_ID)).toMatchObject({ position: FIRST_ID, version: 1 });
        expect(repository.items.get(THIRD_ID)).toMatchObject({ position: THIRD_ID, version: 1 });
    });

    it('rejects the second of two moves based on the same version', async () => {
        const repository = inMemoryItemRepository(items());
        const reorder = makeReorderItem(repository);

        await reorder(request());
        await expect(reorder(request(SECOND_ID, THIRD_ID))).rejects.toBeInstanceOf(ItemPositionConflict);
        expect(repository.items.get(SECOND_ID)).toMatchObject({ position: FIRST_ID, version: 2 });
    });

    it('refuses a target in another priority group', async () => {
        const [first, second] = items();
        if (first === undefined || second === undefined) throw new Error('Missing test items');
        const repository = inMemoryItemRepository([first, { ...second, priority: 'high' }]);

        await expect(makeReorderItem(repository)(request())).rejects.toBeInstanceOf(InvalidItemPosition);
    });
});
