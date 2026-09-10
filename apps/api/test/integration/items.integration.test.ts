import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '../../../../packages/infra/src/database.types.js';

import { json } from '../http-harness.js';
import type { Harness } from '../http-harness.js';
import { integrationConfig, realApplication, registerAndSignIn, serveAs } from './support.js';
import type { RealAccount } from './support.js';

// Against the real stack (Postgres, PostgREST, GoTrue, migrations applied),
// not the fakes packages/core/items/test and packages/core/auth/test provide
// for the unit and HTTP-contract suites. What this file proves is that the
// pieces work when actually wired together -- the composition root, the
// service-role-backed repository, the RLS-enabled schema -- which no amount of
// fake-backed testing can.
//
// Row-level security itself, reached without the service-role bypass, is
// exercised separately in row-level-security.integration.test.ts: this file
// tests the API's own authorization, that file tests the database's.
const MOT_DE_PASSE = 'IntegrationTest2026';
const UNKNOWN_ITEM_ID = '22222222-2222-4222-8222-222222222222';

describe('items API (integration)', () => {
    let app: Awaited<ReturnType<typeof realApplication>>;
    let owner: RealAccount;
    let intruder: RealAccount;
    let asOwner: Harness;
    let asIntruder: Harness;

    function itemsOf(account: RealAccount): string {
        return `/projects/${account.projectId}/items`;
    }

    beforeAll(async () => {
        app = realApplication();
        await app.start();
        owner = await registerAndSignIn(app, MOT_DE_PASSE);
        intruder = await registerAndSignIn(app, MOT_DE_PASSE);
        asOwner = await serveAs(app, owner.cookie);
        asIntruder = await serveAs(app, intruder.cookie);
    });

    afterAll(async () => {
        await asOwner.close();
        await asIntruder.close();
        await app.stop();
    });

    it('cree un item et le renvoie sans le proprietaire', async () => {
        const response = await asOwner.request(itemsOf(owner), json('POST', { name: 'Depot integration' }));
        const created = (await response.json()) as Record<string, unknown>;

        expect(response.status).toBe(200);
        expect(created).not.toHaveProperty('ownerId');
        expect(created.name).toBe('Depot integration');
        expect(created).toMatchObject({ status: 'todo', version: 1 });
    });

    describe('isolation entre comptes', () => {
        let itemId: string;

        beforeAll(async () => {
            const response = await asOwner.request(itemsOf(owner), json('POST', { name: 'A moi' }));
            itemId = ((await response.json()) as { id: string }).id;
        });

        it('le proprietaire voit son item dans la liste', async () => {
            const page = (await (await asOwner.request(itemsOf(owner))).json()) as {
                items: { id: string }[];
            };

            expect(page.items.map((item) => item.id)).toContain(itemId);
        });

        it('un autre compte ne voit pas cet item dans sa liste', async () => {
            const response = await asIntruder.request(itemsOf(owner));

            expect(response.status).toBe(404);
            expect((await response.json()) as object).toMatchObject({
                type: 'project_not_found',
            });
        });

        it('le proprietaire peut le modifier', async () => {
            const response = await asOwner.request(
                `${itemsOf(owner)}/${itemId}`,
                json('PUT', { name: 'A moi, renomme' }),
            );

            expect(response.status).toBe(200);
        });

        // Meme reponse qu un item inexistant : voir items.test.ts pour la
        // meme regle deja exercee contre des doublures.
        it('un autre compte ne peut pas le modifier, et ne le change pas', async () => {
            const before = (await (await asOwner.request(itemsOf(owner))).json()) as {
                items: { id: string }[];
            };
            expect(before.items.map((item) => item.id)).toContain(itemId);

            const denied = await asIntruder.request(
                `${itemsOf(owner)}/${itemId}`,
                json('PUT', { name: 'Vole' }),
            );
            const missing = await asOwner.request(
                `${itemsOf(owner)}/${UNKNOWN_ITEM_ID}`,
                json('PUT', { name: 'Vole' }),
            );

            expect(denied.status).toBe(404);
            expect(missing.status).toBe(404);
            expect((await denied.json()) as object).toMatchObject({ type: 'item_not_found' });
            expect((await missing.json()) as object).toMatchObject({ type: 'item_not_found' });

            const stillMine = (await (await asOwner.request(itemsOf(owner))).json()) as {
                items: { id: string; name: string }[];
            };
            expect(stillMine.items.find((item) => item.id === itemId)?.name).toBe('A moi, renomme');
        });

        it('un autre compte ne peut pas le supprimer, et il reste present', async () => {
            const before = (await (await asOwner.request(itemsOf(owner))).json()) as {
                items: { id: string }[];
            };
            expect(before.items.map((item) => item.id)).toContain(itemId);

            const denied = await asIntruder.request(`${itemsOf(owner)}/${itemId}`, {
                method: 'DELETE',
            });
            const missing = await asOwner.request(`${itemsOf(owner)}/${UNKNOWN_ITEM_ID}`, {
                method: 'DELETE',
            });

            expect(denied.status).toBe(404);
            expect(missing.status).toBe(404);
            expect((await denied.json()) as object).toMatchObject({ type: 'item_not_found' });
            expect((await missing.json()) as object).toMatchObject({ type: 'item_not_found' });

            const stillThere = (await (await asOwner.request(itemsOf(owner))).json()) as {
                items: { id: string }[];
            };
            expect(stillThere.items.map((item) => item.id)).toContain(itemId);
        });

        it('deplace un item sans laisser une version perimee ecraser le resultat', async () => {
            const before = (await (await asOwner.request(itemsOf(owner))).json()) as {
                items: { id: string; version: number }[];
            };
            const version = before.items.find((item) => item.id === itemId)?.version;
            expect(version).toBeTypeOf('number');

            const moved = await asOwner.request(
                `${itemsOf(owner)}/${itemId}/status`,
                json('PATCH', { status: 'doing', version }),
            );
            const stale = await asOwner.request(
                `${itemsOf(owner)}/${itemId}/status`,
                json('PATCH', { status: 'done', version }),
            );

            expect(moved.status).toBe(200);
            expect(stale.status).toBe(409);
            expect((await stale.json()) as object).toMatchObject({ type: 'item_status_conflict' });

            const after = (await (await asOwner.request(itemsOf(owner))).json()) as {
                items: { id: string; status: string; version: number }[];
            };
            expect(after.items.find((item) => item.id === itemId)).toMatchObject({
                status: 'doing',
                version: Number(version) + 1,
            });
        });

        it('ne revele pas un item a un non-membre lors d un deplacement', async () => {
            const denied = await asIntruder.request(
                `${itemsOf(owner)}/${itemId}/status`,
                json('PATCH', { status: 'done', version: 1 }),
            );
            const missing = await asOwner.request(
                `${itemsOf(owner)}/${UNKNOWN_ITEM_ID}/status`,
                json('PATCH', { status: 'done', version: 1 }),
            );

            expect(denied.status).toBe(404);
            expect(missing.status).toBe(404);
            expect((await denied.json()) as object).toMatchObject({ type: 'item_not_found' });
            expect((await missing.json()) as object).toMatchObject({ type: 'item_not_found' });
        });

        it('le proprietaire peut le supprimer', async () => {
            const response = await asOwner.request(`${itemsOf(owner)}/${itemId}`, {
                method: 'DELETE',
            });

            expect(response.status).toBe(204);

            const config = integrationConfig();
            const database = createClient<Database>(config.supabaseUrl, config.supabaseServiceRoleKey, {
                auth: { persistSession: false, autoRefreshToken: false },
            });
            const stored = await database.from('items').select('id').eq('id', itemId).maybeSingle();
            expect(stored.error).toBeNull();
            expect(stored.data).toBeNull();
        });
    });
});
