import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
// notification is what event-consumer.test.ts and the demonstration flow
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

        // Les items s adressent par leur projet depuis US-16 : sur /items le
        // serveur rend la coquille de l application, et la lecture JSON echoue
        // sur un document HTML.
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

    describe('isolation entre comptes', () => {
        let notificationId: string;

        beforeAll(async () => {
            notificationId = await seedNotification(owner.id, itemId);
        });

        it('le proprietaire voit sa notification dans la liste', async () => {
            const page = (await (await asOwner.request('/notifications')).json()) as {
                notifications: { id: string }[];
            };

            expect(page.notifications.map(n => n.id)).toContain(notificationId);
        });

        it('un autre compte ne voit pas cette notification dans sa liste', async () => {
            const page = (await (await asIntruder.request('/notifications')).json()) as {
                notifications: { id: string }[];
            };

            expect(page.notifications.map(n => n.id)).not.toContain(notificationId);
        });

        it('le proprietaire peut la marquer comme lue', async () => {
            const response = await asOwner.request(`/notifications/${notificationId}/read`, {
                method: 'PATCH',
            });

            expect(response.status).toBe(204);

            const page = (await (await asOwner.request('/notifications')).json()) as {
                notifications: { id: string; readAt: string | null }[];
            };
            expect(page.notifications.find(n => n.id === notificationId)?.readAt).not.toBeNull();
        });

        // Meme reponse qu une notification inexistante : voir notifications.test.ts
        // pour la meme regle deja exercee contre une doublure.
        it('un autre compte ne peut pas la marquer comme lue', async () => {
            const response = await asIntruder.request(`/notifications/${notificationId}/read`, {
                method: 'PATCH',
            });

            expect(response.status).toBe(404);
        });
    });

    it('le compte de non lues ne compte que celles du compte de la session', async () => {
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
