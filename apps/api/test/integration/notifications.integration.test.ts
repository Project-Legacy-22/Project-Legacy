import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { NotificationPageDto } from '@legacy/contracts';

import { json } from '../http-harness.js';
import type { Harness } from '../http-harness.js';
import { integrationConfig, realApplication, registerAndSignIn, serveAs } from './support.js';
import type { RealAccount } from './support.js';

// Against the real stack, not the in-memory fake notifications.test.ts uses
// for its contract-level coverage: this file proves the Supabase adapter's
// cursor and the migration's mark_notification_read function actually behave
// against Postgres, and that the row-level-security policies do not
// accidentally hide a caller's own rows from the service-role-backed API.
//
// A notification is seeded through the same RPC the worker calls
// (record_item_created_notification), with the service-role key: spinning up
// the real broker and worker process to prove the event flow itself creates a
// notification is what event-consumer.test.ts and event-flow.integration.test.ts
// already cover, and duplicating it here would only make this suite slower.
const MOT_DE_PASSE = 'IntegrationTest2026';

async function seedNotification(ownerId: string, itemId: string): Promise<string> {
    const config = integrationConfig();
    const client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const eventId = randomUUID();
    const { error } = await client.rpc('record_item_created_notification', {
        p_event_id: eventId,
        p_user_id: ownerId,
        p_item_id: itemId,
    });
    if (error) throw new Error('setup: could not seed a notification', { cause: error });

    const { data, error: readError } = await client
        .from('notifications')
        .select('id')
        .eq('event_id', eventId)
        .single();
    if (readError || data === null) {
        throw new Error('setup: could not read the seeded notification back', { cause: readError });
    }
    return data.id as string;
}

describe('notifications API (integration)', () => {
    let app: Awaited<ReturnType<typeof realApplication>>;
    let owner: RealAccount;
    let intruder: RealAccount;
    let asOwner: Harness;
    let asIntruder: Harness;
    let itemId: string;

    beforeAll(async () => {
        app = realApplication();
        await app.start();
        owner = await registerAndSignIn(app, MOT_DE_PASSE);
        intruder = await registerAndSignIn(app, MOT_DE_PASSE);
        asOwner = await serveAs(app, owner.cookie);
        asIntruder = await serveAs(app, intruder.cookie);

        // Items are addressed through their project since US-16: on /items the server returns the
        // application shell, and reading JSON fails on an HTML document.
        const created = await asOwner.request(
            `/projects/${owner.projectId}/items`,
            json('POST', { name: 'Depot integration' }),
        );
        itemId = ((await created.json()) as { id: string }).id;
    });

    afterAll(async () => {
        await asOwner.close();
        await asIntruder.close();
        await app.stop();
    });

    describe('isolation between accounts', () => {
        let notificationId: string;

        beforeAll(async () => {
            notificationId = await seedNotification(owner.id, itemId);
        });

        it('the owner sees their notification in the list', async () => {
            const page = (await (await asOwner.request('/notifications')).json()) as {
                notifications: { id: string }[];
            };

            expect(page.notifications.map(n => n.id)).toContain(notificationId);
        });

        // The missing guard, and the reason #344 reached production: the route builds its DTO by
        // assignment, not by parse, so TypeScript is satisfied while the string carries a shape the
        // client refuses. Only the browser validated this response, and it is in no suite. Here the
        // database is real, so the dates are the ones PostgreSQL actually returns.
        it('returns a page the contract accepts, dates included', async () => {
            const body = await (await asOwner.request('/notifications')).json();

            const lu = NotificationPageDto.safeParse(body);

            expect(
                lu.success ? [] : lu.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
            ).toEqual([]);
        });

        it('another account does not see this notification in its list', async () => {
            const page = (await (await asIntruder.request('/notifications')).json()) as {
                notifications: { id: string }[];
            };

            expect(page.notifications.map(n => n.id)).not.toContain(notificationId);
        });

        it('the owner can mark it as read', async () => {
            const response = await asOwner.request(`/notifications/${notificationId}/read`, {
                method: 'PATCH',
            });

            expect(response.status).toBe(204);

            const page = (await (await asOwner.request('/notifications')).json()) as {
                notifications: { id: string; readAt: string | null }[];
            };
            expect(page.notifications.find(n => n.id === notificationId)?.readAt).not.toBeNull();
        });

        // Same answer as a notification that does not exist: see notifications.test.ts for the same
        // rule already exercised against a double.
        it('another account cannot mark it as read', async () => {
            const response = await asIntruder.request(`/notifications/${notificationId}/read`, {
                method: 'PATCH',
            });

            expect(response.status).toBe(404);
        });
    });

    it('the unread count only counts those of the session\'s account', async () => {
        await seedNotification(owner.id, itemId);

        const [ownerCount, intruderCount] = await Promise.all([
            asOwner.request('/notifications/unread-count'),
            asIntruder.request('/notifications/unread-count'),
        ]);

        const ownerBody = (await ownerCount.json()) as { unread: number };
        const intruderBody = (await intruderCount.json()) as { unread: number };

        expect(ownerBody.unread).toBeGreaterThan(0);
        expect(intruderBody.unread).toBe(0);
    });
});
