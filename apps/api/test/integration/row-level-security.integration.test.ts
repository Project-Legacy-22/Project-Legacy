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

describe('politiques RLS sur items (sans role de service)', () => {
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
        const item = await app.useCases.items.addItem('Vu par PostgREST', owner.id);
        itemId = item.id;
    });

    afterAll(() => app.stop());

    it('le proprietaire lit sa ligne directement via PostgREST', async () => {
        const { data, error } = await postgrestAs(owner.accessToken)
            .from('items')
            .select('id')
            .eq('id', itemId);

        expect(error).toBeNull();
        expect(data).toEqual([{ id: itemId }]);
    });

    // RLS filtre les lignes plutot que de refuser la requete : une lecture
    // sans droit ne renvoie pas une erreur, elle renvoie un ensemble vide,
    // comme si la ligne n existait pas pour cet appelant.
    it('un autre compte ne recoit rien pour la meme ligne', async () => {
        const { data, error } = await postgrestAs(intruder.accessToken)
            .from('items')
            .select('id')
            .eq('id', itemId);

        expect(error).toBeNull();
        expect(data).toEqual([]);
    });

    it('un autre compte ne peut pas la modifier, et elle reste intacte', async () => {
        const { data } = await postgrestAs(intruder.accessToken)
            .from('items')
            .update({ name: 'Vole via PostgREST' })
            .eq('id', itemId)
            .select();

        // Meme comportement de filtrage qu en lecture : zero ligne touchee,
        // sans erreur, plutot qu un refus explicite.
        expect(data).toEqual([]);

        const { data: intacte } = await postgrestAs(owner.accessToken)
            .from('items')
            .select('name')
            .eq('id', itemId);
        expect(intacte).toEqual([{ name: 'Vu par PostgREST' }]);
    });

    it('un autre compte ne peut pas la supprimer', async () => {
        const { data } = await postgrestAs(intruder.accessToken)
            .from('items')
            .delete()
            .eq('id', itemId)
            .select();

        expect(data).toEqual([]);

        const { data: toujoursLa } = await postgrestAs(owner.accessToken)
            .from('items')
            .select('id')
            .eq('id', itemId);
        expect(toujoursLa).toEqual([{ id: itemId }]);
    });

    // La politique d insertion verifie user_id = auth.uid() : un appelant ne
    // peut pas ecrire une ligne au nom de quelqu un d autre, meme la sienne.
    it('un compte ne peut pas creer une ligne au nom d un autre', async () => {
        const { data, error } = await postgrestAs(intruder.accessToken)
            .from('items')
            .insert({ user_id: owner.id, name: 'Usurpe' })
            .select();

        expect(data).toBeNull();
        expect(error).not.toBeNull();
    });

    it('un compte peut creer une ligne en son propre nom', async () => {
        const { data, error } = await postgrestAs(intruder.accessToken)
            .from('items')
            .insert({ user_id: intruder.id, name: 'A moi, via PostgREST' })
            .select('id');

        expect(error).toBeNull();
        expect(data).toHaveLength(1);
    });
});
