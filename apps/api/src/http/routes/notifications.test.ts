import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IdentityProvider } from '@legacy/core-auth';
import type { Notification } from '@legacy/core-notifications';
import {
    makeEraseAccount,
    makeExportPersonalData,
    makeIdentifyCaller,
    makeRegisterAccount,
    makeRequestPasswordReset,
    makeResetPassword,
    makeSignIn,
    makeSignOut,
} from '@legacy/core-auth';
import {
    makeCountUnreadNotifications,
    makeListNotifications,
    makeMarkNotificationRead,
} from '@legacy/core-notifications';
// The reference doubles live with the port they implement. Copying them here would let the copy
// drift from the contract it stands for.
import { inMemoryCompromisedPasswords } from '../../../../../packages/core/auth/test/fakes/in-memory-compromised-passwords.js';
import { inMemoryIdentityProvider } from '../../../../../packages/core/auth/test/fakes/in-memory-identity-provider.js';
import { inMemoryPersonalDataStore } from '../../../../../packages/core/auth/test/fakes/in-memory-personal-data-store.js';
import { inMemoryNotificationRepository } from '../../../../../packages/core/notifications/test/fakes/in-memory-notification-repository.js';
import type { InMemoryNotificationRepository } from '../../../../../packages/core/notifications/test/fakes/in-memory-notification-repository.js';
import { aNotification } from '../../../../../packages/core/notifications/test/builders/notification.js';

import { createServer } from '../server.js';
import { SESSION_COOKIE } from '../session.js';
import type { AppUseCases } from '../../composition-root.js';
import { recordingLogger } from '../../../../../packages/contracts/test/fakes/recording-logger.js';
import { listen, testConfig } from '../../../test/http-harness.js';
import type { Harness } from '../../../test/http-harness.js';
import { makeAppUseCases } from '../../../test/fakes/app-use-cases.js';

const OWNER_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_OWNER_ID = '00000000-0000-7000-8000-000000000002';
const ADRESSE = 'alice@example.com';
const MOT_DE_PASSE = 'MotDePasse2026';

// Identifiers are UUIDs by contract (packages/contracts NotificationIdParams),
// so the fixtures use real ones: a readable string such as 'notif-1' would be
// rejected at the boundary, and the test would prove nothing about the route
// behind it.
const FIRST_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ID = '22222222-2222-4222-8222-222222222222';
const THIRD_ID = '33333333-3333-4333-8333-333333333333';
const UNKNOWN_ID = '44444444-4444-4444-8444-444444444444';

// The item repository refuses every call: these routes do not need it, and a call reaching it would
// answer 500 instead of the expected result.
function useCasesOver(
    repository: InMemoryNotificationRepository,
    provider: IdentityProvider,
): AppUseCases {
    const personalData = inMemoryPersonalDataStore();

    return makeAppUseCases({
        notifications: {
            listNotifications: makeListNotifications(repository),
            markNotificationRead: makeMarkNotificationRead(repository),
            countUnread: makeCountUnreadNotifications(repository),
        },
        auth: {
            registerAccount: makeRegisterAccount(provider),
            signIn: makeSignIn(provider),
            identifyCaller: makeIdentifyCaller(provider),
            requestPasswordReset: makeRequestPasswordReset(provider),
            resetPassword: makeResetPassword({
                provider,
                compromisedPasswords: inMemoryCompromisedPasswords(),
            }),
            signOut: makeSignOut(provider),
        },
        account: {
            exportPersonalData: makeExportPersonalData({
                store: personalData,
                now: () => new Date('2026-09-10T10:00:00.000Z'),
            }),
            eraseAccount: makeEraseAccount({ store: personalData, identity: provider }),
        },
    });
}

describe('notifications API', () => {
    let harness: Harness;
    let store: InMemoryNotificationRepository;

    // Every request in this suite carries a session, like the item routes:
    // the refusal without one is asserted once, in the authentication suite.
    async function serve(seed: Notification[] = []): Promise<void> {
        store = inMemoryNotificationRepository(seed);
        const provider = inMemoryIdentityProvider([
            { id: OWNER_ID, email: ADRESSE, password: MOT_DE_PASSE },
        ]);
        const session = await makeSignIn(provider)(ADRESSE, MOT_DE_PASSE);
        const logger = recordingLogger();

        harness = await listen(
            createServer(testConfig, useCasesOver(store, provider), { logger: logger }),
            logger,
            `${SESSION_COOKIE}=${session.accessToken}`,
        );
    }

    async function reseed(seed: Notification[]): Promise<void> {
        await harness.close();
        await serve(seed);
    }

    beforeEach(() => serve());
    afterEach(() => harness.close());

    describe('GET /notifications', () => {
        it('returns the notifications of the session\'s account', async () => {
            await reseed([aNotification({ id: FIRST_ID, userId: OWNER_ID })]);

            const response = await harness.request('/notifications');
            const body = (await response.json()) as { notifications: { id: string }[] };

            expect(response.status).toBe(200);
            expect(body.notifications.map(n => n.id)).toEqual([FIRST_ID]);
        });

        it('does not return the notifications of another account', async () => {
            await reseed([aNotification({ id: FIRST_ID, userId: OTHER_OWNER_ID })]);

            const response = await harness.request('/notifications');
            const body = (await response.json()) as { notifications: unknown[] };

            expect(body.notifications).toEqual([]);
        });

        it('tells read notifications from unread ones in the response', async () => {
            await reseed([
                aNotification({ id: FIRST_ID, userId: OWNER_ID, readAt: null }),
                aNotification({
                    id: SECOND_ID,
                    userId: OWNER_ID,
                    readAt: '2026-09-10T11:00:00.000Z',
                }),
            ]);

            const response = await harness.request('/notifications');
            const body = (await response.json()) as { notifications: { id: string; readAt: string | null }[] };

            expect(body.notifications.map(n => ({ id: n.id, readAt: n.readAt }))).toEqual([
                { id: SECOND_ID, readAt: '2026-09-10T11:00:00.000Z' },
                { id: FIRST_ID, readAt: null },
            ]);
        });

        it('bounds the list and serves the rest from the cursor', async () => {
            await reseed([
                aNotification({ id: FIRST_ID, userId: OWNER_ID }),
                aNotification({ id: SECOND_ID, userId: OWNER_ID }),
            ]);

            const first = (await (await harness.request('/notifications?limit=1')).json()) as {
                notifications: { id: string }[];
                nextCursor: string | null;
            };
            const next = `/notifications?limit=1&cursor=${encodeURIComponent(String(first.nextCursor))}`;
            const second = (await (await harness.request(next)).json()) as {
                notifications: { id: string }[];
                nextCursor: string | null;
            };

            expect(first.notifications.map(n => n.id)).toEqual([SECOND_ID]);
            expect(second.notifications.map(n => n.id)).toEqual([FIRST_ID]);
            expect(second.nextCursor).toBeNull();
        });

        it('refuses a cursor not issued by the API', async () => {
            const response = await harness.request('/notifications?cursor=curseur-invente');

            expect(response.status).toBe(400);
        });

        it('refuses a page size out of bounds', async () => {
            const response = await harness.request('/notifications?limit=1000');

            expect(response.status).toBe(400);
        });
    });

    describe('GET /notifications/unread-count', () => {
        it('returns the unread count of the session\'s account', async () => {
            await reseed([
                aNotification({ id: FIRST_ID, userId: OWNER_ID, readAt: null }),
                aNotification({
                    id: SECOND_ID,
                    userId: OWNER_ID,
                    readAt: '2026-09-10T11:00:00.000Z',
                }),
                aNotification({ id: THIRD_ID, userId: OTHER_OWNER_ID, readAt: null }),
            ]);

            const response = await harness.request('/notifications/unread-count');

            expect(response.status).toBe(200);
            await expect(response.json()).resolves.toEqual({ unread: 1 });
        });
    });

    describe('PATCH /notifications/:id/read', () => {
        it('marks a notification as read', async () => {
            await reseed([aNotification({ id: FIRST_ID, userId: OWNER_ID, readAt: null })]);

            const response = await harness.request(`/notifications/${FIRST_ID}/read`, { method: 'PATCH' });

            expect(response.status).toBe(204);
            expect(store.notifications.get(FIRST_ID)?.readAt).not.toBeNull();
        });

        // Blocking criterion of US-18: replaying the action must not fail.
        it('is idempotent on a notification already read', async () => {
            await reseed([
                aNotification({ id: FIRST_ID, userId: OWNER_ID, readAt: '2026-09-10T11:00:00.000Z' }),
            ]);

            const response = await harness.request(`/notifications/${FIRST_ID}/read`, { method: 'PATCH' });

            expect(response.status).toBe(204);
        });

        it('refuses an identifier that is not a uuid', async () => {
            const response = await harness.request('/notifications/pas-un-uuid/read', {
                method: 'PATCH',
            });

            expect(response.status).toBe(400);
        });

        it('answers 404 for a notification that does not exist', async () => {
            const response = await harness.request(
                `/notifications/${UNKNOWN_ID}/read`,
                { method: 'PATCH' },
            );

            expect(response.status).toBe(404);
        });

        // Same answer as for a notification that does not exist: a 403 would confirm that this
        // identifier designates something.
        it('answers 404 for the notification of another account and leaves it intact', async () => {
            await reseed([aNotification({ id: FIRST_ID, userId: OTHER_OWNER_ID, readAt: null })]);

            const response = await harness.request(`/notifications/${FIRST_ID}/read`, { method: 'PATCH' });

            expect(response.status).toBe(404);
            expect(store.notifications.get(FIRST_ID)?.readAt).toBeNull();
        });

        it('describes the error in the expected format', async () => {
            const response = await harness.request(
                `/notifications/${UNKNOWN_ID}/read`,
                { method: 'PATCH' },
            );
            const problem = (await response.json()) as Record<string, unknown>;

            expect(problem.type).toBe('notification_not_found');
            expect(problem.status).toBe(404);
        });
    });
});
