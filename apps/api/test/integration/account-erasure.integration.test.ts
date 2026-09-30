import { beforeAll, describe, expect, it } from 'vitest';

import { ItemPageDto, NotificationPageDto, PendingInvitationListDto } from '@legacy/contracts';
import type { Application } from '../../src/composition-root.js';
import { json } from '../http-harness.js';
import type { Harness } from '../http-harness.js';
import { realApplication, registerAndSignIn, serveAs } from './support.js';
import type { RealAccount } from './support.js';
import { membershipClient, sharedProject } from './member-removal-support.js';

// #425 end to end: erasing an account must not take a shared project's work
// with it. No erasure test reached the real database before this file --
// makeEraseAccount's own suite exercises the rule against a fake store, never
// what erase_account actually does to a row someone else still needs.
let app: Application;

beforeAll(() => {
    app = realApplication();
});

async function eraseAccount(account: RealAccount, session: Harness): Promise<void> {
    const response = await session.request('/auth/me', json('DELETE', { confirmation: account.email }));
    expect(response.status).toBe(204);
}

describe('account erasure in a shared project, against the real API and database', () => {
    it('keeps a task after its creator is erased, with the creator link broken', async () => {
        const owner = await registerAndSignIn(app, 'ErasureTest2026');
        const creator = await registerAndSignIn(app, 'ErasureTest2026');
        const asOwner = await serveAs(app, owner.cookie);
        const asCreator = await serveAs(app, creator.cookie);
        const projectId = await sharedProject(app, { owner, member: creator });

        const created = await asCreator.request(
            `/projects/${projectId}/items`,
            json('POST', { name: 'Survives its creator' }),
        );
        expect(created.status).toBe(200);
        const item = (await created.json()) as { id: string };

        await eraseAccount(creator, asCreator);

        const row = await membershipClient().from('items').select('user_id, name').eq('id', item.id).single();
        expect(row.error).toBeNull();
        expect(row.data).toEqual({ user_id: null, name: 'Survives its creator' });

        const page = ItemPageDto.parse(
            await (await asOwner.request(`/projects/${projectId}/items`)).json(),
        );
        expect(page.items.map(i => i.id)).toContain(item.id);

        await Promise.all([asOwner.close(), asCreator.close()]);
    });

    it('reassigns ownership to the longest-standing member when the sole owner is erased', async () => {
        const erased = await registerAndSignIn(app, 'ErasureTest2026');
        const remaining = await registerAndSignIn(app, 'ErasureTest2026');
        const asErased = await serveAs(app, erased.cookie);
        const projectId = await sharedProject(app, { owner: erased, member: remaining });

        await eraseAccount(erased, asErased);

        const memberships = await membershipClient()
            .from('project_memberships')
            .select('user_id, role')
            .eq('project_id', projectId);
        expect(memberships.error).toBeNull();
        expect(memberships.data).toEqual([{ user_id: remaining.id, role: 'owner' }]);

        await asErased.close();
    });

    it('still deletes a project where the erased account was the only member', async () => {
        const alone = await registerAndSignIn(app, 'ErasureTest2026');
        const asAlone = await serveAs(app, alone.cookie);
        const soloProjectId = alone.projectId;

        await eraseAccount(alone, asAlone);

        const project = await membershipClient().from('projects').select('id').eq('id', soloProjectId);
        expect(project.error).toBeNull();
        expect(project.data).toEqual([]);

        await asAlone.close();
    });

    it('leaves no row naming the erased account in the tables erasure touches', async () => {
        const owner = await registerAndSignIn(app, 'ErasureTest2026');
        const creator = await registerAndSignIn(app, 'ErasureTest2026');
        const asOwner = await serveAs(app, owner.cookie);
        const asCreator = await serveAs(app, creator.cookie);
        const projectId = await sharedProject(app, { owner, member: creator });
        await asCreator.request(`/projects/${projectId}/items`, json('POST', { name: 'Anonymised after' }));

        await eraseAccount(creator, asCreator);

        const client = membershipClient();
        const [user, membership, itemsOwnedByCreator] = await Promise.all([
            client.from('users').select('id').eq('id', creator.id),
            client.from('project_memberships').select('project_id').eq('user_id', creator.id),
            client.from('items').select('id').eq('user_id', creator.id),
        ]);

        expect(user.data).toEqual([]);
        expect(membership.data).toEqual([]);
        expect(itemsOwnedByCreator.data).toEqual([]);

        await Promise.all([asOwner.close(), asCreator.close()]);
    });

    it('keeps a notification produced by the erased account for the person it was for', async () => {
        const inviter = await registerAndSignIn(app, 'ErasureTest2026');
        const remaining = await registerAndSignIn(app, 'ErasureTest2026');
        const guest = await registerAndSignIn(app, 'ErasureTest2026');
        const asInviter = await serveAs(app, inviter.cookie);
        const asGuest = await serveAs(app, guest.cookie);
        // Owned by the inviter with a real member remaining, so the project
        // itself survives the erasure: the invitation has to outlive it on its
        // own merits, not because the project happened to disappear with it.
        const projectId = await sharedProject(app, { owner: inviter, member: remaining });

        const invited = await asInviter.request(
            `/projects/${projectId}/invitations`,
            json('POST', { email: guest.email }),
        );
        expect(invited.status).toBe(201);
        await app.useCases.notifications.deliverPending();

        const before = NotificationPageDto.parse(await (await asGuest.request('/notifications')).json());
        const notification = before.notifications.find(n => n.kind === 'invitation.created');
        expect(notification).not.toBeUndefined();

        await eraseAccount(inviter, asInviter);

        const after = NotificationPageDto.parse(await (await asGuest.request('/notifications')).json());
        expect(after.notifications.map(n => n.id)).toContain(notification?.id);

        const pending = PendingInvitationListDto.parse(
            await (await asGuest.request('/projects/invitations')).json(),
        );
        expect(pending.invitations.find(i => i.projectId === projectId)?.invitedByEmail).toBeNull();

        const row = await membershipClient()
            .from('project_invitations')
            .select('invited_by')
            .eq('project_id', projectId)
            .single();
        expect(row.error).toBeNull();
        expect(row.data).toEqual({ invited_by: null });

        await Promise.all([asInviter.close(), asGuest.close()]);
    });
});
