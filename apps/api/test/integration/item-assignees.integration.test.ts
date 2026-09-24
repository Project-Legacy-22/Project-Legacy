import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ItemDto, ItemPageDto, PendingInvitationListDto } from '@legacy/contracts';
import type { Application } from '../../src/composition-root.js';
import { json } from '../http-harness.js';
import type { Harness } from '../http-harness.js';
import { realApplication, registerAndSignIn, serveAs } from './support.js';
import type { RealAccount } from './support.js';

// US-58 against the real API and database: the membership key refuses an
// outsider, and removing the assignee from the project leaves the task
// unassigned rather than deleting it.
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

async function assign(assigneeId: string | null): Promise<Response> {
    return asOwner.request(itemPath, json('PUT', { name: 'Assigned task', assigneeId }));
}

beforeAll(async () => {
    app = realApplication();
    owner = await registerAndSignIn(app, 'AssigneeTest2026');
    member = await registerAndSignIn(app, 'AssigneeTest2026');
    stranger = await registerAndSignIn(app, 'AssigneeTest2026');
    asOwner = await serveAs(app, owner.cookie);
    await join(owner.projectId, member);

    const created = ItemDto.parse(
        await (await asOwner.request(`/projects/${owner.projectId}/items`, json('POST', { name: 'Assigned task' }))).json(),
    );
    itemPath = `/projects/${owner.projectId}/items/${created.id}`;
});

afterAll(async () => {
    await asOwner.close();
});

describe('assigning a task against the real database', () => {
    it('assigns to a member, who sees it assigned to them', async () => {
        const response = await assign(member.id);

        expect(response.status).toBe(200);
        const asMember = await serveAs(app, member.cookie);
        const page = ItemPageDto.parse(await (await asMember.request(`/projects/${owner.projectId}/items`)).json());
        await asMember.close();
        expect(page.items.find(item => itemPath.endsWith(item.id))?.assigneeId).toBe(member.id);
    });

    it('refuses someone outside the project with 404 and keeps the assignee', async () => {
        const response = await assign(stranger.id);

        expect(response.status).toBe(404);
        const current = ItemDto.parse(await (await asOwner.request(itemPath, json('PUT', { name: 'Assigned task' }))).json());
        expect(current.assigneeId).toBe(member.id);
    });

    it('leaves the task unassigned, and in place, when the assignee leaves the project', async () => {
        await assign(member.id);

        const removed = await asOwner.request(`/projects/${owner.projectId}/members/${member.id}`, { method: 'DELETE' });

        expect(removed.status).toBe(204);
        const current = ItemDto.parse(await (await asOwner.request(itemPath, json('PUT', { name: 'Assigned task' }))).json());
        expect(current.assigneeId).toBeNull();
    });
});
