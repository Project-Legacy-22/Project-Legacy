import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ProjectMemberListDto, ProjectPageDto } from '@legacy/contracts';
import type { Application } from '../../src/composition-root.js';
import { json } from '../http-harness.js';
import type { Harness } from '../http-harness.js';
import { realApplication, registerAndSignIn, serveAs } from './support.js';
import type { RealAccount } from './support.js';
import { membershipClient, sharedProject } from './member-removal-support.js';

let app: Application;
let owner: RealAccount;
let member: RealAccount;
let stranger: RealAccount;
let asOwner: Harness;
let asMember: Harness;
let asStranger: Harness;

beforeAll(async () => {
    app = realApplication();
    owner = await registerAndSignIn(app, 'MemberRemovalTest2026');
    member = await registerAndSignIn(app, 'MemberRemovalTest2026');
    stranger = await registerAndSignIn(app, 'MemberRemovalTest2026');
    asOwner = await serveAs(app, owner.cookie);
    asMember = await serveAs(app, member.cookie);
    asStranger = await serveAs(app, stranger.cookie);
});

afterAll(async () => {
    await Promise.all([asOwner.close(), asMember.close(), asStranger.close()]);
});

describe('project member removal against the real API and database', () => {
    it('preserves the account, all tasks and other memberships while revoking project access', async () => {
        const projectId = await sharedProject(app, { owner, member });
        const item = await app.useCases.items.addItem({
            projectId, ownerId: member.id, name: 'Keep the creator and content',
            priority: 'high', dueDate: '2026-09-01',
        });
        const before = await membershipClient().from('items').select('*').eq('id', item.id).single();
        expect(before.error).toBeNull();
        const visibleBefore = await membershipClient(member.accessToken).from('items').select('id').eq('id', item.id);
        expect(visibleBefore.data).toEqual([{ id: item.id }]);

        const response = await asOwner.request(`/projects/${projectId}/members/${member.id}`, { method: 'DELETE' });

        expect(response.status).toBe(204);
        const after = await membershipClient().from('items').select('*').eq('id', item.id).single();
        expect(after.error).toBeNull();
        expect(after.data).toEqual(before.data);
        const page = ProjectPageDto.parse(await (await asMember.request('/projects')).json());
        expect(page.projects.map(project => project.id)).not.toContain(projectId);
        expect(page.projects.map(project => project.id)).toContain(member.projectId);
        expect((await asMember.request('/auth/me')).status).toBe(200);
        const members = ProjectMemberListDto.parse(await (await asOwner.request(`/projects/${projectId}/members`)).json());
        expect(members.members.map(row => row.userId)).toEqual([owner.id]);
    });

    it.each([
        { method: 'GET', suffix: '/members', body: undefined },
        { method: 'GET', suffix: '/items', body: undefined },
        { method: 'POST', suffix: '/items', body: { name: 'Denied creation' } },
        { method: 'PUT', suffix: '/items/:item', body: { name: 'Denied change' } },
        { method: 'PATCH', suffix: '/items/:item/status', body: { status: 'doing', version: 1 } },
        { method: 'DELETE', suffix: '/items/:item', body: undefined },
        { method: 'DELETE', suffix: '', body: undefined },
    ])('refuses $method $suffix after removal', async ({ method, suffix, body }) => {
        const projectId = await sharedProject(app, { owner, member });
        const item = await app.useCases.items.addItem({ projectId, ownerId: member.id, name: 'Kept task' });
        await app.useCases.projects.removeProjectMember({ projectId, callerId: owner.id, memberId: member.id });

        const response = await asMember.request(
            `/projects/${projectId}${suffix.replace(':item', item.id)}`,
            body === undefined ? { method } : json(method, body),
        );

        expect(response.status).toBe(404);
    });

    it('enforces revoked membership through RLS even with the still-valid session token', async () => {
        const projectId = await sharedProject(app, { owner, member });
        const item = await app.useCases.items.addItem({ projectId, ownerId: member.id, name: 'Kept task' });
        await app.useCases.projects.removeProjectMember({ projectId, callerId: owner.id, memberId: member.id });
        const client = membershipClient(member.accessToken);

        const read = await client.from('items').select('id').eq('id', item.id);
        const changed = await client.from('items').update({ name: 'Forbidden' }).eq('id', item.id).select('id');
        const deleted = await client.from('items').delete().eq('id', item.id).select('id');
        const inserted = await client.from('items').insert({ project_id: projectId, user_id: member.id, name: 'Forbidden' });

        expect(read.error).toBeNull();
        expect(read.data).toEqual([]);
        expect(changed.data).toEqual([]);
        expect(deleted.data).toEqual([]);
        expect(inserted.error?.code).toBe('42501');
        const kept = await membershipClient().from('items').select('name').eq('id', item.id).single();
        expect(kept.data).toEqual({ name: 'Kept task' });
    });

    it('answers a stranger like an absent project and leaves memberships intact', async () => {
        const projectId = await sharedProject(app, { owner, member });

        const forbidden = await asStranger.request(`/projects/${projectId}/members/${member.id}`, { method: 'DELETE' });
        const absent = await asStranger.request(`/projects/${randomUUID()}/members/${member.id}`, { method: 'DELETE' });

        expect(forbidden.status).toBe(404);
        expect(absent.status).toBe(404);
        expect(await app.useCases.projects.listProjectMembers(projectId, owner.id)).toHaveLength(2);
    });

    it('refuses a non-owner and the last owner without changing data', async () => {
        const projectId = await sharedProject(app, { owner, member });

        const forbidden = await asMember.request(`/projects/${projectId}/members/${owner.id}`, { method: 'DELETE' });
        const last = await asOwner.request(`/projects/${projectId}/members/${owner.id}`, { method: 'DELETE' });

        expect(forbidden.status).toBe(403);
        expect(last.status).toBe(409);
        expect(await app.useCases.projects.listProjectMembers(projectId, owner.id)).toHaveLength(2);
    });

    it('does not expose the internal RPC to anonymous or authenticated clients', async () => {
        const projectId = await sharedProject(app, { owner, member });
        const args = { p_project_id: projectId, p_caller_id: owner.id, p_member_id: member.id };

        const signedIn = await membershipClient(member.accessToken).rpc('remove_project_member', args);
        const anonymous = await membershipClient(null).rpc('remove_project_member', args);

        expect(signedIn.error?.code).toBe('42501');
        expect(anonymous.error?.code).toBe('42501');
        expect(await app.useCases.projects.listProjectMembers(projectId, owner.id)).toHaveLength(2);
    });

    it('allows an owner to leave only when another owner remains', async () => {
        const projectId = await sharedProject(app, { owner, member }, 'owner');

        const response = await asOwner.request(`/projects/${projectId}/members/${owner.id}`, { method: 'DELETE' });

        expect(response.status).toBe(204);
        expect(await app.useCases.projects.listProjectMembers(projectId, member.id)).toEqual([
            { userId: member.id, email: member.email, role: 'owner' },
        ]);
    });
});
