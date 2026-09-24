import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { NotificationPageDto, PendingInvitationListDto, ProjectPageDto } from '@legacy/contracts';
import type { Application } from '../../src/composition-root.js';
import { json } from '../http-harness.js';
import type { Harness } from '../http-harness.js';
import { realApplication, registerAndSignIn, serveAs } from './support.js';
import type { RealAccount } from './support.js';

// #401 end to end: the owner invites through the API, the delivery pass relays
// the event and the consumer writes the notification, and the person invited
// answers from it. Nothing is seeded behind the API's back.
let app: Application;
let owner: RealAccount;
let guest: RealAccount;
let asOwner: Harness;
let asGuest: Harness;

beforeAll(async () => {
    app = realApplication();
    owner = await registerAndSignIn(app, 'InvitationsTest2026');
    guest = await registerAndSignIn(app, 'InvitationsTest2026');
    asOwner = await serveAs(app, owner.cookie);
    asGuest = await serveAs(app, guest.cookie);
});

afterAll(async () => {
    await Promise.all([asOwner.close(), asGuest.close()]);
});

async function invitationNotification() {
    const page = NotificationPageDto.parse(await (await asGuest.request('/notifications')).json());
    return page.notifications.find(notification => notification.kind === 'invitation.created' && notification.projectId === owner.projectId);
}

describe('inviting into a project against the real API, database and event flow', () => {
    it('notifies the person invited, who joins the project by accepting', async () => {
        const invited = await asOwner.request(`/projects/${owner.projectId}/invitations`, json('POST', { email: guest.email }));
        expect(invited.status).toBe(201);

        await app.useCases.notifications.deliverPending();

        const notification = await invitationNotification();
        expect(notification).toMatchObject({ invitationStatus: 'pending', itemId: null });
        expect(notification?.projectName).toEqual(expect.any(String));

        const pending = PendingInvitationListDto.parse(await (await asGuest.request('/projects/invitations')).json());
        expect(pending.invitations.map(invitation => invitation.id)).toEqual([notification?.invitationId]);
        expect(pending.invitations[0]?.invitedByEmail).toBe(owner.email);

        const accepted = await asGuest.request(`/projects/invitations/${notification?.invitationId ?? ''}/accept`, { method: 'POST' });
        expect(accepted.status).toBe(204);

        const projects = ProjectPageDto.parse(await (await asGuest.request('/projects')).json());
        expect(projects.projects.map(project => project.id)).toContain(owner.projectId);
        expect((await invitationNotification())?.invitationStatus).toBe('accepted');
        expect((await asGuest.request(`/projects/invitations/${notification?.invitationId ?? ''}/decline`, { method: 'POST' })).status).toBe(409);
    });

    it('answers a second invitation of a member without creating one', async () => {
        const response = await asOwner.request(`/projects/${owner.projectId}/invitations`, json('POST', { email: guest.email }));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ outcome: 'already_member' });
    });

    it('keeps a declining person out of the project', async () => {
        const decliner = await registerAndSignIn(app, 'InvitationsTest2026');
        const asDecliner = await serveAs(app, decliner.cookie);
        await asOwner.request(`/projects/${owner.projectId}/invitations`, json('POST', { email: decliner.email }));
        const pending = PendingInvitationListDto.parse(await (await asDecliner.request('/projects/invitations')).json());

        const declined = await asDecliner.request(`/projects/invitations/${pending.invitations[0]?.id ?? ''}/decline`, { method: 'POST' });

        expect(declined.status).toBe(204);
        const projects = ProjectPageDto.parse(await (await asDecliner.request('/projects')).json());
        expect(projects.projects.map(project => project.id)).not.toContain(owner.projectId);
        await asDecliner.close();
    });
});
