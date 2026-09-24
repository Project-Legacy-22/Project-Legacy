import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ItemDto, ItemPageDto, PendingInvitationListDto } from '@legacy/contracts';
import type { Application } from '../../src/composition-root.js';
import { json } from '../http-harness.js';
import type { Harness } from '../http-harness.js';
import { realApplication, registerAndSignIn, serveAs } from './support.js';
import type { RealAccount } from './support.js';

// US-58 and #419 against the real API and database: the membership key
// refuses an outsider, a task can be assigned to several members from its
// creation, and removing one of them removes only their assignment.
let app: Application;
let owner: RealAccount;
let member: RealAccount;
let stranger: RealAccount;
let asOwner: Harness;
let itemPath: string;

async function join(project: string, guest: RealAccount): Promise<void> {
    await asOwner.request(`/projects/${project}/invitations`, json('POST', { email: guest.email }));
    const asGuest = await serveAs(app, guest.cookie);
    const pending = PendingInvitationListDto.parse(await (await asGuest.request('/projects/invitations')).json());
    await asGuest.request(`/projects/invitations/${pending.invitations[0]?.id ?? ''}/accept`, { method: 'POST' });
    await asGuest.close();
}

async function assign(assigneeIds: readonly string[]): Promise<Response> {
    return asOwner.request(itemPath, json('PUT', { name: 'Assigned task', assigneeIds }));
}

async function current(): Promise<ItemDto> {
    return ItemDto.parse(await (await asOwner.request(itemPath, json('PUT', { name: 'Assigned task' }))).json());
}

beforeAll(async () => {
    app = realApplication();
    owner = await registerAndSignIn(app, 'AssigneeTest2026');
    member = await registerAndSignIn(app, 'AssigneeTest2026');
    stranger = await registerAndSignIn(app, 'AssigneeTest2026');
    asOwner = await serveAs(app, owner.cookie);
    await join(owner.projectId, member);

    const created = await asOwner.request(
        `/projects/${owner.projectId}/items`,
        json('POST', { name: 'Assigned task', assigneeIds: [owner.id, member.id] }),
    );
    itemPath = `/projects/${owner.projectId}/items/${ItemDto.parse(await created.json()).id}`;
});

afterAll(async () => {
    await asOwner.close();
});

describe('assigning a task against the real database', () => {
    it('creates it assigned to both members, and each sees it so', async () => {
        const asMember = await serveAs(app, member.cookie);
        const page = ItemPageDto.parse(await (await asMember.request(`/projects/${owner.projectId}/items`)).json());
        await asMember.close();

        expect(page.items.find(item => itemPath.endsWith(item.id))?.assigneeIds).toEqual([owner.id, member.id].sort());
    });

    it('refuses a creation with someone outside the project, and writes no task', async () => {
        const before = ItemPageDto.parse(await (await asOwner.request(`/projects/${owner.projectId}/items`)).json());

        const response = await asOwner.request(
            `/projects/${owner.projectId}/items`,
            json('POST', { name: 'Refused', assigneeIds: [stranger.id] }),
        );

        expect(response.status).toBe(404);
        const after = ItemPageDto.parse(await (await asOwner.request(`/projects/${owner.projectId}/items`)).json());
        expect(after.items).toHaveLength(before.items.length);
    });

    it('refuses a change with someone outside the project and keeps the list', async () => {
        expect((await assign([member.id, stranger.id])).status).toBe(404);
        expect((await current()).assigneeIds).toEqual([owner.id, member.id].sort());
    });

    it('keeps its order through a move, which reads the assignees back', async () => {
        const moved = await asOwner.request(`${itemPath}/status`, json('PATCH', { status: 'doing', version: (await current()).version }));

        expect(ItemDto.parse(await moved.json()).assigneeIds).toEqual([owner.id, member.id].sort());
    });

    it('drops only the leaving member from the list, and keeps the task', async () => {
        const removed = await asOwner.request(`/projects/${owner.projectId}/members/${member.id}`, { method: 'DELETE' });

        expect(removed.status).toBe(204);
        expect((await current()).assigneeIds).toEqual([owner.id]);
        expect((await assign([])).status).toBe(200);
        expect((await current()).assigneeIds).toEqual([]);
    });
});
