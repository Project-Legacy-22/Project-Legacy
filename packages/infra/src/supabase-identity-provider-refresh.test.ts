import { afterEach, describe, expect, it } from 'vitest';
import { ServiceUnavailable } from '@legacy/contracts';

import { createSupabaseIdentityProvider } from './supabase-identity-provider.js';
import { SESSION, TOKEN, UTILISATEUR, fauxFournisseur } from '../test/fakes/gotrue-server.js';
import type { FauxFournisseur } from '../test/fakes/gotrue-server.js';

// Session renewal (US-27), apart from the rest of the adapter. The rotation itself is GoTrue's job;
// what is checked here is the translation of its answers: which ones mean "the session is over",
// which ones are an outage. Confusing the two would sign everybody out at the provider's first
// unavailability.
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
            }),
            faux,
        };
    }

    afterEach(() => faux.close());

    it('returns a session whose refresh token has rotated', async () => {
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

    // Reuse outside the reuse interval: GoTrue has already ended the session and revoked its tokens
    // before answering. There is nothing to recover here, only to report it as an end.
    it('returns no session when the token has already been exchanged', async () => {
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

    it('returns no session behind a token the provider does not know', async () => {
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

    it('propagates an unexpected provider error', async () => {
        const { provider, faux: serveur } = await adaptateur();
        // 422 and not 500. The SDK classes any GoTrue 5xx as an infrastructure outage that it
        // retries for twenty-five seconds, and that the adapter turns into unavailability (#383). A
        // 422 carries a code the adapter does not know, without being retried.
        serveur.quand(TOKEN, {
            status: 422,
            body: { code: 422, error_code: 'unexpected_failure', msg: 'refus inconnu' },
        });

        const echec: unknown = await provider.refresh('a-refresh-token').catch((error: unknown) => error);

        expect(echec).not.toBeInstanceOf(ServiceUnavailable);
        expect(String(echec)).toMatch(/refresh failed/);
    });

    // #383: the GoTrue rate limit seen in production on 23 September answered 500. It is a
    // transient unavailability, which the HTTP layer turns into a 503 with a delay.
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

    // The message of an adapter error goes to the log. It names the operation, never the secret it
    // was given: criterion of issue #28, no token in a log or in an error message.
    it('does not quote the token in the error it throws', async () => {
        const { provider, faux: serveur } = await adaptateur();
        // 429 and not 500. Since @supabase/supabase-js 2.115, _refreshAccessToken retries a 5xx
        // response with an exponential delay as long as the next one fits in its thirty-second
        // window: measured, eight attempts over twenty-five seconds. A unit test cannot wait for
        // that, and lengthening its timeout would disguise the problem as a slow suite.
        //
        // A 429 takes the same branch -- the adapter only treats 400 and 401 specially, which it
        // reads as an expired session -- without being retried. The failure latency on 5xx has its
        // own issue.
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
