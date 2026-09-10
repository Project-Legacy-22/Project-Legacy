import { afterEach, describe, expect, it } from 'vitest';

import { createSupabaseIdentityProvider } from './supabase-identity-provider.js';
import { SESSION, TOKEN, UTILISATEUR, fauxFournisseur } from '../test/fakes/gotrue-server.js';
import type { FauxFournisseur } from '../test/fakes/gotrue-server.js';

// Le renouvellement de session (US-27), a part du reste de l adaptateur. La
// rotation elle-meme est le travail de GoTrue ; ce qui se verifie ici est la
// traduction de ses reponses : lesquelles veulent dire "la session est finie",
// lesquelles sont une panne. Confondre les deux deconnecterait tout le monde a
// la premiere indisponibilite du fournisseur.
describe('adaptateur Supabase Auth, renouvellement de session', () => {
    const SESSION_RENOUVELEE = {
        ...SESSION,
        access_token: 'jeton-acces-2',
        refresh_token: 'jeton-rafraichissement-2',
    };

    let faux: FauxFournisseur;

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

    it('rend une session dont le jeton de rafraichissement a tourne', async () => {
        const { provider, faux: serveur } = await adaptateur();
        serveur.quand(TOKEN, { status: 200, body: SESSION_RENOUVELEE });

        const session = await provider.refresh('jeton-rafraichissement');

        expect(session).toEqual({
            account: { id: UTILISATEUR.id, email: UTILISATEUR.email },
            accessToken: 'jeton-acces-2',
            refreshToken: 'jeton-rafraichissement-2',
            expiresInSeconds: 3600,
        });
    });

    // La reutilisation hors de l intervalle de reprise : GoTrue a deja termine
    // la session et revoque ses jetons avant de repondre. Il n y a rien a
    // rattraper ici, seulement a le rapporter comme une fin.
    it('ne rend aucune session quand le jeton a deja ete echange', async () => {
        const { provider, faux: serveur } = await adaptateur();
        serveur.quand(TOKEN, {
            status: 400,
            body: {
                code: 400,
                error_code: 'refresh_token_already_used',
                msg: 'Invalid Refresh Token: Already Used',
            },
        });

        await expect(provider.refresh('jeton-rafraichissement')).resolves.toBeUndefined();
    });

    it('ne rend aucune session derriere un jeton que le fournisseur ne connait pas', async () => {
        const { provider, faux: serveur } = await adaptateur();
        serveur.quand(TOKEN, {
            status: 400,
            body: {
                code: 400,
                error_code: 'refresh_token_not_found',
                msg: 'Invalid Refresh Token: Not Found',
            },
        });

        await expect(provider.refresh('jeton-invente')).resolves.toBeUndefined();
    });

    it('propage une erreur inattendue du fournisseur', async () => {
        const { provider, faux: serveur } = await adaptateur();
        serveur.quand(TOKEN, {
            status: 500,
            body: { code: 500, error_code: 'unexpected_failure', msg: 'panne' },
        });

        await expect(provider.refresh('jeton-rafraichissement')).rejects.toThrow(/refresh/);
    });

    // Le message d une erreur d adaptateur part au journal. Il nomme
    // l operation, jamais le secret qu on lui a passe : critere de l issue #28,
    // aucun jeton dans un journal ni dans un message d erreur.
    it('ne cite pas le jeton dans l erreur qu il leve', async () => {
        const { provider, faux: serveur } = await adaptateur();
        serveur.quand(TOKEN, {
            status: 500,
            body: { code: 500, error_code: 'unexpected_failure', msg: 'panne' },
        });

        const echec: unknown = await provider
            .refresh('jeton-rafraichissement')
            .catch((error: unknown) => error);

        expect(String(echec)).not.toContain('jeton-rafraichissement');
    });
});
