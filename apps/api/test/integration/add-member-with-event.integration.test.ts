import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { membershipCreated } from '@legacy/core-projects';

// Le client est type, sinon `.rpc` rend `any` et la regle qui interdit une
// valeur `any` non verifiee refuse le fichier -- a juste titre : c est
// exactement ici, au contact de PostgREST, qu une forme doit etre connue.
import type { Database } from '../../../../packages/infra/src/database.types.js';

import type { Application } from '../../src/composition-root.js';
import { integrationConfig, realApplication, registerAndSignIn } from './support.js';
import type { RealAccount } from './support.js';

// La promesse d ADR-0007, pour l appartenance : la ligne et l evenement qui
// l annonce sont ecrits ensemble ou pas du tout. Une doublure ne peut rien en
// dire -- c est la fonction de base qui porte la transaction, et PostgREST en
// ouvre une par requete.
//
// Pourquoi ce test nettoie ce qu il ecrit, dans un `finally` : le catalogue de
// `packages/contracts` ne connait pas encore `membership.created.v1`, parce
// que rien ne doit emettre cet evenement avant que le consommateur sache
// l ecrire en notification (#359) -- un evenement qu il refuse est **perdu**,
// la passe le retire de la file sans le remettre. Une ligne d outbox portant ce
// nom bloquerait donc le relais, qui refuse une ligne hors catalogue. Le
// nettoyage n est pas de la politesse, il est la condition pour prouver la
// transaction avant que la chaine soit complete.
const MOT_DE_PASSE = 'IntegrationTest2026';

let app: Application;
let ada: RealAccount;
let alan: RealAccount;

function serviceRole(): SupabaseClient<Database> {
    const config = integrationConfig();
    return createClient<Database>(config.supabaseUrl, config.supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

async function nettoyer(eventId: string, projectId: string, memberId: string): Promise<void> {
    const client = serviceRole();
    await client.from('outbox').delete().eq('id', eventId);
    await client
        .from('project_memberships')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', memberId);
}

async function ajouter(eventId: string): Promise<boolean> {
    const event = membershipCreated(eventId, new Date(), {
        projectId: ada.projectId,
        memberId: alan.id,
        addedBy: ada.id,
    });

    const { data, error } = await serviceRole().rpc('add_member_with_event', {
        p_project_id: ada.projectId,
        p_user_id: alan.id,
        p_event_id: event.id,
        p_event_name: event.name,
        p_occurred_at: event.occurredAt,
        p_payload: event.payload,
    });

    if (error) throw new Error(`add_member_with_event: ${error.message}`);
    return data;
}

const ECRITS: { eventId: string }[] = [];

beforeAll(async () => {
    app = realApplication();
    ada = await registerAndSignIn(app, MOT_DE_PASSE);
    alan = await registerAndSignIn(app, MOT_DE_PASSE);
});

afterEach(async () => {
    for (const { eventId } of ECRITS.splice(0)) {
        await nettoyer(eventId, ada.projectId, alan.id);
    }
});

describe('add_member_with_event, against the real database', () => {
    it('writes the membership and the event, or neither', async () => {
        const eventId = '0191f3c2-aaaa-7000-8000-000000000001';
        ECRITS.push({ eventId });

        await expect(ajouter(eventId)).resolves.toBe(true);

        const client = serviceRole();
        const { data: membre } = await client
            .from('project_memberships')
            .select('role')
            .eq('project_id', ada.projectId)
            .eq('user_id', alan.id)
            .single();
        const { data: evenement } = await client
            .from('outbox')
            .select('name,published_at')
            .eq('id', eventId)
            .single();

        expect(membre?.role).toBe('member');
        expect(evenement?.name).toBe('membership.created.v1');
        // Non publie : c est le relais qui publiera, pas la fonction.
        expect(evenement?.published_at).toBeNull();
    });

    // Le proprietaire qui hesite, ou qui double-clique. Rien ecrit, donc rien
    // annonce : ajouter deux fois ne notifie pas deux fois.
    it('adds nothing and announces nothing the second time', async () => {
        const premier = '0191f3c2-aaaa-7000-8000-000000000002';
        const second = '0191f3c2-aaaa-7000-8000-000000000003';
        ECRITS.push({ eventId: premier }, { eventId: second });

        await expect(ajouter(premier)).resolves.toBe(true);
        await expect(ajouter(second)).resolves.toBe(false);

        const { count } = await serviceRole()
            .from('outbox')
            .select('*', { count: 'exact', head: true })
            .in('id', [premier, second]);

        expect(count).toBe(1);
    });
});
