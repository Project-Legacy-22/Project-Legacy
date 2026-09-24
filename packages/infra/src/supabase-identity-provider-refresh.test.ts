import { afterEach, describe, expect, it } from 'vitest';
import { ServiceUnavailable } from '@legacy/contracts';

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
        access_token: 'renewed-access',
        refresh_token: 'renewed-refresh',
    };

    let faux: FauxFournisseur;

    async function adaptateur() {
        faux = await fauxFournisseur();

        return {
            provider: createSupabaseIdentityProvider({
                url: faux.url,
                anonKey: 'cle-publique',
                serviceRoleKey: 'cle-de-service',
                linkOrigin: 'https://app.example.test',
            }),
            faux,
        };
    }

    afterEach(() => faux.close());

    it('rend une session dont le jeton de rafraichissement a tourne', async () => {
        const { provider, faux: serveur } = await adaptateur();
        serveur.quand(TOKEN, { status: 200, body: SESSION_RENOUVELEE });

        const session = await provider.refresh('a-refresh-token');

        expect(session).toEqual({
            account: { id: UTILISATEUR.id, email: UTILISATEUR.email },
            accessToken: 'renewed-access',
            refreshToken: 'renewed-refresh',
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

        await expect(provider.refresh('a-refresh-token')).resolves.toBeUndefined();
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
        // 422 et non 500. Le SDK classe tout 5xx de GoTrue comme une panne
        // d infrastructure qu il reessaie pendant vingt-cinq secondes, et que
        // l adaptateur rend en indisponibilite (#383). Un 422 porte un code que
        // l adaptateur ne connait pas, sans etre reessaye.
        serveur.quand(TOKEN, {
            status: 422,
            body: { code: 422, error_code: 'unexpected_failure', msg: 'refus inconnu' },
        });

        const echec: unknown = await provider.refresh('a-refresh-token').catch((error: unknown) => error);

        expect(echec).not.toBeInstanceOf(ServiceUnavailable);
        expect(String(echec)).toMatch(/refresh failed/);
    });

    // #383 : la limite de debit de GoTrue relevee en production le 23 septembre
    // repondait 500. C est une indisponibilite passagere, que la couche HTTP
    // rend en 503 avec un delai.
    it('reports a provider rate limit as a passing unavailability', async () => {
        const { provider, faux: serveur } = await adaptateur();
        serveur.quand(TOKEN, {
            status: 429,
            body: { code: 429, error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' },
        });

        const echec: unknown = await provider.refresh('a-refresh-token').catch((error: unknown) => error);

        expect(echec).toBeInstanceOf(ServiceUnavailable);
        expect(echec).toMatchObject({ reason: 'rate_limited', retryAfterSeconds: 30 });
    });

    // Le message d une erreur d adaptateur part au journal. Il nomme
    // l operation, jamais le secret qu on lui a passe : critere de l issue #28,
    // aucun jeton dans un journal ni dans un message d erreur.
    it('ne cite pas le jeton dans l erreur qu il leve', async () => {
        const { provider, faux: serveur } = await adaptateur();
        // 429 et non 500. Depuis @supabase/supabase-js 2.115, _refreshAccessToken
        // reessaie une reponse 5xx avec un delai exponentiel tant que le prochain
        // tient dans sa fenetre de trente secondes : mesure, huit tentatives sur
        // vingt-cinq secondes. Un test unitaire ne peut pas attendre ca, et
        // allonger son delai deguiserait le probleme en lenteur de suite.
        //
        // Un 429 emprunte la meme branche -- l adaptateur ne traite specialement
        // que 400 et 401, qu il lit comme une session expiree -- sans etre
        // reessaye. La latence d echec sur 5xx a son issue.
        serveur.quand(TOKEN, {
            status: 429,
            body: { code: 429, error_code: 'over_request_rate_limit', msg: 'trop de demandes' },
        });

        const echec: unknown = await provider
            .refresh('a-refresh-token')
            .catch((error: unknown) => error);

        expect(String(echec)).not.toContain('a-refresh-token');
    });
});
