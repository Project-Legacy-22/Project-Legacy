import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ITEM_CREATED_V1, NotificationPageDto } from '@legacy/contracts';

import { json } from '../http-harness.js';
import type { Harness } from '../http-harness.js';
import { integrationConfig, realApplication, registerAndSignIn, serveAs } from './support.js';
import type { RealAccount } from './support.js';

// The event flow of US-10 against the real stack: Postgres, the broker and the
// consumer. event-consumer.test.ts and outbox-relay.test.ts cover consumption
// and idempotence against doubles; what only the real database can prove is
// that the task and its event are one transaction, and what only the whole
// chain can prove is the flow shown in review.
const MOT_DE_PASSE = 'IntegrationTest2026';

function serviceClient() {
    const config = integrationConfig();
    return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

interface Creation {
    itemId: string;
    eventId: string;
}

describe('event flow (integration)', () => {
    let app: Awaited<ReturnType<typeof realApplication>>;
    let owner: RealAccount;
    let asOwner: Harness;
    const database = serviceClient();

    // The call the item repository makes: the task, its assignees and its
    // event, written by one database function.
    function createWithEvent({ itemId, eventId }: Creation) {
        return database.rpc('create_item_with_event', {
            p_item_id: itemId,
            p_user_id: owner.id,
            p_project_id: owner.projectId,
            p_name: 'Transactional integration item',
            p_priority: 'normal',
            // No default in the database function: PostgREST only finds it when
            // every argument without one is named.
            p_due_date: null,
            p_event_id: eventId,
            p_event_name: ITEM_CREATED_V1,
            p_occurred_at: new Date().toISOString(),
            p_payload: { itemId, ownerId: owner.id },
            p_assignee_ids: [],
        });
    }

    async function itemExists(itemId: string): Promise<boolean> {
        const { data, error } = await database.from('items').select('id').eq('id', itemId).maybeSingle();
        if (error) throw new Error('could not read items', { cause: error });
        return data !== null;
    }

    async function eventExists(eventId: string): Promise<boolean> {
        const { data, error } = await database.from('outbox').select('id').eq('id', eventId).maybeSingle();
        if (error) throw new Error('could not read the outbox', { cause: error });
        return data !== null;
    }

    beforeAll(async () => {
        app = realApplication();
        await app.start();
        owner = await registerAndSignIn(app, MOT_DE_PASSE);
        asOwner = await serveAs(app, owner.cookie);
    });

    afterAll(async () => {
        await asOwner.close();
        await app.stop();
    });

    describe('publication in the same transaction as the task', () => {
        it('writes neither the task nor anything else when its event cannot be written', async () => {
            const first = { itemId: randomUUID(), eventId: randomUUID() };
            const refused = { itemId: randomUUID(), eventId: first.eventId };
            expect((await createWithEvent(first)).error).toBeNull();

            const { error } = await createWithEvent(refused);

            expect(error).not.toBeNull();
            expect(await itemExists(refused.itemId)).toBe(false);
        });

        it('writes no event when its task cannot be written', async () => {
            const first = { itemId: randomUUID(), eventId: randomUUID() };
            const refused = { itemId: first.itemId, eventId: randomUUID() };
            expect((await createWithEvent(first)).error).toBeNull();

            const { error } = await createWithEvent(refused);

            expect(error).not.toBeNull();
            expect(await eventExists(refused.eventId)).toBe(false);
        });

        it('writes the task and its event together when both succeed', async () => {
            const creation = { itemId: randomUUID(), eventId: randomUUID() };

            const { error } = await createWithEvent(creation);

            expect(error).toBeNull();
            expect([await itemExists(creation.itemId), await eventExists(creation.eventId)]).toEqual([true, true]);
        });
    });

    // The flow of the demonstration, kept green permanently: creating a task
    // over HTTP publishes item.created.v1, the relay hands it to the broker,
    // and the consumer turns it into a notification its owner can read.
    it('turns a task created over HTTP into a notification its owner reads', async () => {
        const creation = await asOwner.request(
            `/projects/${owner.projectId}/items`,
            json('POST', { name: 'Demonstrated through the event flow' }),
        );
        const item = (await creation.json()) as { id: string };

        const page = NotificationPageDto.parse(await (await asOwner.request('/notifications')).json());

        expect(creation.status).toBe(200);
        expect(page.notifications).toContainEqual(
            expect.objectContaining({ kind: 'item.created', itemId: item.id, readAt: null }),
        );
    });
});
