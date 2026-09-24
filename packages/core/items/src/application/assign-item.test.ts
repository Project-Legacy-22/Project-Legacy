import { describe, expect, it } from 'vitest';

import { inMemoryItemRepository } from '../../test/fakes/in-memory-item-repository.js';
import { anItem } from '../../test/builders/item.js';
import { AssigneeNotMember } from '../domain/item.js';
import { makeAddItem } from './add-item.js';
import { makeChangeItem } from './change-item.js';

// US-58, #419: a task is assigned to members of its project, from its creation
// or through the same change as its name and planning.
const OWNER_ID = 'owner-42';
const MEMBER_ID = 'member-7';
const STRANGER_ID = 'stranger-9';
const PROJECT_ID = 'project-1';

function setUp(assigneeIds: readonly string[] = []) {
    const existing = anItem({ id: 'item-1', name: 'Task', projectId: PROJECT_ID, ownerId: OWNER_ID, assigneeIds });
    const repository = inMemoryItemRepository([existing], [{ projectId: PROJECT_ID, userId: MEMBER_ID }]);
    const change = (assignees: readonly string[] | undefined) =>
        makeChangeItem(repository)({
            id: 'item-1',
            projectId: PROJECT_ID,
            memberId: OWNER_ID,
            changes: { name: 'Task', assigneeIds: assignees },
        });
    const ids = ['new-item', 'new-event'];
    const add = (assignees: readonly string[]) =>
        makeAddItem({ repository, newId: () => ids.shift() ?? 'spent', now: () => new Date('2026-09-24T12:00:00Z') })({
            name: 'New task',
            projectId: PROJECT_ID,
            ownerId: OWNER_ID,
            assigneeIds: assignees,
        });
    return { existing, repository, change, add };
}

describe('assigning a task', () => {
    it('assigns it to several members, once each and in a stable order, keeping its creator', async () => {
        const { repository, change } = setUp();

        const updated = await change([MEMBER_ID, OWNER_ID, MEMBER_ID]);

        expect(updated).toMatchObject({ assigneeIds: [MEMBER_ID, OWNER_ID], ownerId: OWNER_ID, version: 2 });
        expect(repository.items.get('item-1')?.assigneeIds).toEqual([MEMBER_ID, OWNER_ID]);
    });

    it('unassigns it with an empty list', async () => {
        const { change } = setUp([MEMBER_ID]);

        await expect(change([])).resolves.toMatchObject({ assigneeIds: [] });
    });

    it('leaves the assignees alone when the change does not mention them', async () => {
        const { change } = setUp([MEMBER_ID]);

        await expect(change(undefined)).resolves.toMatchObject({ assigneeIds: [MEMBER_ID] });
    });

    it('refuses a list with someone outside the project, and writes nothing', async () => {
        const { existing, repository, change } = setUp();

        await expect(change([MEMBER_ID, STRANGER_ID])).rejects.toBeInstanceOf(AssigneeNotMember);
        expect(repository.items.get('item-1')).toEqual(existing);
    });

    it('creates a task already assigned, and announces it like any other', async () => {
        const { repository, add } = setUp();

        const created = await add([MEMBER_ID]);

        expect(created).toMatchObject({ id: 'new-item', assigneeIds: [MEMBER_ID], ownerId: OWNER_ID });
        expect(repository.recordedEvents).toHaveLength(1);
    });

    it('creates nothing when an assignee is outside the project', async () => {
        const { repository, add } = setUp();

        await expect(add([STRANGER_ID])).rejects.toBeInstanceOf(AssigneeNotMember);
        expect(repository.items.has('new-item')).toBe(false);
        expect(repository.recordedEvents).toEqual([]);
    });

    it('refuses with the same 404 posture as a missing task', () => {
        const refusal = new AssigneeNotMember();

        expect({ code: refusal.code, status: refusal.httpStatus }).toEqual({ code: 'assignee_not_found', status: 404 });
    });
});
