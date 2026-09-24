import { describe, expect, it } from 'vitest';

import { inMemoryItemRepository } from '../../test/fakes/in-memory-item-repository.js';
import { anItem } from '../../test/builders/item.js';
import { AssigneeNotMember } from '../domain/item.js';
import { makeChangeItem } from './change-item.js';

// US-58: a task is assigned through the same change as its name and planning,
// to a member of its project or to nobody.
const OWNER_ID = 'owner-42';
const MEMBER_ID = 'member-7';
const STRANGER_ID = 'stranger-9';
const PROJECT_ID = 'project-1';

function setUp(assigneeId: string | null = null) {
    const existing = anItem({ id: 'item-1', name: 'Task', projectId: PROJECT_ID, ownerId: OWNER_ID, assigneeId });
    const repository = inMemoryItemRepository([existing], [{ projectId: PROJECT_ID, userId: MEMBER_ID }]);
    const change = (assignee: string | null | undefined) =>
        makeChangeItem(repository)({
            id: 'item-1',
            projectId: PROJECT_ID,
            memberId: OWNER_ID,
            changes: { name: 'Task', assigneeId: assignee },
        });
    return { existing, repository, change };
}

describe('assigning a task', () => {
    it('assigns it to a member of its project, keeping its creator', async () => {
        const { repository, change } = setUp();

        const updated = await change(MEMBER_ID);

        expect(updated).toMatchObject({ assigneeId: MEMBER_ID, ownerId: OWNER_ID, version: 2 });
        expect(repository.items.get('item-1')?.assigneeId).toBe(MEMBER_ID);
    });

    it('unassigns it with null', async () => {
        const { change } = setUp(MEMBER_ID);

        await expect(change(null)).resolves.toMatchObject({ assigneeId: null });
    });

    it('leaves the assignee alone when the change does not mention it', async () => {
        const { change } = setUp(MEMBER_ID);

        await expect(change(undefined)).resolves.toMatchObject({ assigneeId: MEMBER_ID });
    });

    it('refuses someone outside the project, and writes nothing', async () => {
        const { existing, repository, change } = setUp();

        await expect(change(STRANGER_ID)).rejects.toBeInstanceOf(AssigneeNotMember);
        expect(repository.items.get('item-1')).toEqual(existing);
    });

    it('refuses with the same 404 posture as a missing task', () => {
        const refusal = new AssigneeNotMember();

        expect({ code: refusal.code, status: refusal.httpStatus }).toEqual({ code: 'assignee_not_found', status: 404 });
    });
});
