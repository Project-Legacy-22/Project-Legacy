import { afterEach, describe, expect, it } from 'vitest';

import { fauxFournisseur } from '../test/fakes/fake-gotrue.js';
import type { FakeGoTrue } from '../test/fakes/fake-gotrue.js';
import { createSupabaseIdentityProvider } from './supabase-identity-provider.js';

// Split from supabase-identity-provider.test.ts to keep that file under the
// project's line ceiling; the fake GoTrue server both files drive lives in
// test/fakes/fake-gotrue.ts for the same reason it would otherwise have to be
// duplicated here.
//
// Same route as the client's own signOut: the admin call
// IdentityProvider.signOut() makes carries the target's access token as its
// own Authorization header rather than reaching a distinct admin endpoint.
const LOGOUT = 'POST /auth/v1/logout';

describe('adaptateur Supabase Auth, signOut', () => {
    let faux: FakeGoTrue;

    async function adaptateur() {
        faux = await fauxFournisseur();
        return {
            provider: createSupabaseIdentityProvider({
                url: faux.url,
                anonKey: 'cle-publique',
                serviceRoleKey: 'cle-de-service',
            }),
            faux,
        };
    }

    afterEach(() => faux.close());

    it('resout quand le fournisseur revoque la session', async () => {
        const { provider, faux: serveur } = await adaptateur();
        serveur.quand(LOGOUT, { status: 204, body: {} });

        await expect(provider.signOut('jeton-acces')).resolves.toBeUndefined();
    });

    // Deja invalide est deja l etat vise : rien a signaler.
    it('reste un succes sur un jeton deja invalide', async () => {
        const { provider, faux: serveur } = await adaptateur();
        serveur.quand(LOGOUT, {
            status: 401,
            body: { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' },
        });

        await expect(provider.signOut('jeton-perime')).resolves.toBeUndefined();
    });

    it('propage une panne inattendue du fournisseur', async () => {
        const { provider, faux: serveur } = await adaptateur();
        serveur.quand(LOGOUT, {
            status: 500,
            body: { code: 500, error_code: 'unexpected_failure', msg: 'panne' },
        });

        await expect(provider.signOut('jeton-acces')).rejects.toThrow(/signOut/);
    });
});
