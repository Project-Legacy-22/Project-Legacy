import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { integrationConfig, realApplication, registerAndSignIn } from './support.js';
import type { RealAccount } from './support.js';

// The API reaches Postgres with the service-role key, which bypasses RLS
// entirely (packages/infra/src/supabase-item-repository.ts): every ownership
// check in items.integration.test.ts is the application's own filtering, not
// evidence that the database itself would refuse a leaked service-role key or
// a client that queried PostgREST directly. The policies in
// supabase/migrations/20260904103000_authentication_and_row_level_security.sql
// are that second line of defense, and this file is the only place they are
// ever actually reached: it talks to PostgREST with the anon key and a real
// user access token, the way a browser would, never through the API.
const MOT_DE_PASSE = 'IntegrationTest2026';

// One client per caller, its Authorization header fixed to that user's token
// for the client's lifetime: this is what makes (select auth.uid()) resolve to
// them on every request the client makes, exactly as it would for a browser
// holding that same token.
function postgrestAs(accessToken: string) {
    const config = integrationConfig();
    return createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
}

describe('RLS policies on items (without the service role)', () => {
    let app: Awaited<ReturnType<typeof realApplication>>;
    let owner: RealAccount;
    let intruder: RealAccount;
    let itemId: string;

    beforeAll(async () => {
        app = realApplication();
        await app.start();
        owner = await registerAndSignIn(app, MOT_DE_PASSE);
        intruder = await registerAndSignIn(app, MOT_DE_PASSE);
        // Through the real use case, service-role-backed, exactly as the API
        // itself creates an item: this file is not testing how the row gets
        // there, only who PostgREST lets read, write or erase it afterwards.
        const item = await app.useCases.items.addItem({
            name: 'Vu par PostgREST',
            projectId: owner.projectId,
            ownerId: owner.id,
        });
        itemId = item.id;
    });

    afterAll(() => app.stop());

    it('the owner reads their row directly through PostgREST', async () => {
        const { data, error } = await postgrestAs(owner.accessToken).from('items').select('id').eq('id', itemId);

        expect(error).toBeNull();
        expect(data).toEqual([{ id: itemId }]);
    });

    // RLS filters rows rather than refusing the request: a read without the right does not return
    // an error, it returns an empty set, as if the row did not exist for this caller.
    it('another account receives nothing for the same row', async () => {
        const { data, error } = await postgrestAs(intruder.accessToken).from('items').select('id').eq('id', itemId);

        expect(error).toBeNull();
        expect(data).toEqual([]);
    });

    it('another account sees neither the project nor its membership', async () => {
        const client = postgrestAs(intruder.accessToken);
        const [projects, memberships] = await Promise.all([
            client.from('projects').select('id').eq('id', owner.projectId),
            client.from('project_memberships').select('project_id').eq('project_id', owner.projectId),
        ]);

        expect(projects.error).toBeNull();
        expect(projects.data).toEqual([]);
        expect(memberships.error).toBeNull();
        expect(memberships.data).toEqual([]);
    });

    it('another account cannot change it, and it stays intact', async () => {
        const { data } = await postgrestAs(intruder.accessToken)
            .from('items')
            .update({ name: 'Vole via PostgREST' })
            .eq('id', itemId)
            .select();

        // Same filtering behaviour as for reads: zero rows touched, without an error, rather than
        // an explicit refusal.
        expect(data).toEqual([]);

        const { data: intacte } = await postgrestAs(owner.accessToken).from('items').select('name').eq('id', itemId);
        expect(intacte).toEqual([{ name: 'Vu par PostgREST' }]);
    });

    it('another account cannot delete it', async () => {
        const { data } = await postgrestAs(intruder.accessToken).from('items').delete().eq('id', itemId).select();

        expect(data).toEqual([]);

        const { data: toujoursLa } = await postgrestAs(owner.accessToken).from('items').select('id').eq('id', itemId);
        expect(toujoursLa).toEqual([{ id: itemId }]);
    });

    // The insert policy checks user_id = auth.uid(): a caller cannot write a row in someone else's
    // name, even their own.
    it('an account cannot create a row in another\'s name', async () => {
        const { data, error } = await postgrestAs(intruder.accessToken)
            .from('items')
            .insert({
                user_id: owner.id,
                project_id: owner.projectId,
                name: 'Usurpe',
            })
            .select();

        expect(data).toBeNull();
        expect(error).not.toBeNull();
    });

    it('an account can create a row in its own name', async () => {
        const { data, error } = await postgrestAs(intruder.accessToken)
            .from('items')
            .insert({
                user_id: intruder.id,
                project_id: intruder.projectId,
                name: 'A moi, via PostgREST',
            })
            .select('id');

        expect(error).toBeNull();
        expect(data).toHaveLength(1);
    });
});

describe('RLS policies on notifications (without the service role)', () => {
    let app: Awaited<ReturnType<typeof realApplication>>;
    let owner: RealAccount;
    let intruder: RealAccount;
    let notificationId: string;

    // Seeded with the service role, exactly as the worker would when consuming an event
    // (record_item_created_notification): this file tests whom PostgREST lets read or write once
    // the row is there, not how it gets there.
    async function seedNotification(ownerId: string, itemId: string): Promise<string> {
        const config = integrationConfig();
        const service = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });

        const eventId = randomUUID();
        const { error } = await service.rpc('record_item_created_notification', {
            p_event_id: eventId,
            p_user_id: ownerId,
            p_item_id: itemId,
        });
        if (error) throw new Error('setup: could not seed a notification', { cause: error });

        const { data } = await service
            .from('notifications')
            .select('id')
            .eq('event_id', eventId)
            .single();
        return (data as { id: string }).id;
    }

    beforeAll(async () => {
        app = realApplication();
        await app.start();
        owner = await registerAndSignIn(app, MOT_DE_PASSE);
        intruder = await registerAndSignIn(app, MOT_DE_PASSE);
        const item = await app.useCases.items.addItem({
            name: 'Vu par PostgREST',
            projectId: owner.projectId,
            ownerId: owner.id,
        });
        notificationId = await seedNotification(owner.id, item.id);
    });

    afterAll(() => app.stop());

    it('the owner reads their notification directly through PostgREST', async () => {
        const { data, error } = await postgrestAs(owner.accessToken)
            .from('notifications')
            .select('id')
            .eq('id', notificationId);

        expect(error).toBeNull();
        expect(data).toEqual([{ id: notificationId }]);
    });

    it('another account receives nothing for the same row', async () => {
        const { data, error } = await postgrestAs(intruder.accessToken)
            .from('notifications')
            .select('id')
            .eq('id', notificationId);

        expect(error).toBeNull();
        expect(data).toEqual([]);
    });

    it('the owner can mark it as read directly through PostgREST', async () => {
        const { data, error } = await postgrestAs(owner.accessToken)
            .from('notifications')
            .update({ read_at: new Date().toISOString() })
            .eq('id', notificationId)
            .select();

        expect(error).toBeNull();
        expect(data).toHaveLength(1);
    });

    it('another account cannot create a notification', async () => {
        const { data, error } = await postgrestAs(intruder.accessToken)
            .from('notifications')
            .insert({
                id: randomUUID(),
                user_id: intruder.id,
                item_id: randomUUID(),
                event_id: randomUUID(),
            })
            .select();

        // No insert policy exists for this role: the table only accepts a new row through
        // record_item_created_notification, in SECURITY DEFINER.
        expect(data).toBeNull();
        expect(error).not.toBeNull();
    });
});
