import { afterEach, describe, expect, it } from 'vitest';

import {
    LOGOUT,
    SESSION,
    UPDATE_USER,
    USER,
    UTILISATEUR,
    VERIFY,
    fauxFournisseur,
} from '../test/fakes/gotrue-server.js';
import type { FauxFournisseur } from '../test/fakes/gotrue-server.js';
import { createSupabaseIdentityProvider } from './supabase-identity-provider.js';

// Split from supabase-identity-provider.test.ts to keep that file under the
// project's line ceiling. What these pin is the translation of GoTrue's answers
// to a signed-in credential change (US-36), not the provider itself.
//
// setSession decodes the access token locally to read its expiry, so it has to
// look like a JWT. jwtDeTest builds an unsigned one valid for an hour: GoTrue
// does not check the signature when it reads the token back.
function jwtDeTest(): string {
    const partie = (valeur: unknown) => Buffer.from(JSON.stringify(valeur)).toString('base64url');
    const entete = partie({ alg: 'none', typ: 'JWT' });
    const charge = partie({
        sub: UTILISATEUR.id,
        email: UTILISATEUR.email,
        exp: Math.floor(Date.now() / 1000) + 3600,
    });
    return `${entete}.${charge}.AAAA`;
}

const REFRESH = 'jeton-rafraichissement';

describe('Supabase Auth adapter, credentials change', () => {
    let faux: FauxFournisseur;

    async function adaptateur() {
        faux = await fauxFournisseur();
        // The two calls setSession makes to validate the restored token.
        faux.quand(USER, { status: 200, body: UTILISATEUR });
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

    describe('changePassword', () => {
        it('sets the new password and revokes the other sessions', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(UPDATE_USER, { status: 200, body: UTILISATEUR });
            serveur.quand(LOGOUT, { status: 204, body: {} });

            await expect(
                provider.changePassword(jwtDeTest(), REFRESH, 'NouveauMotDePasse2'),
            ).resolves.toBe('password-changed');
        });

        it('reports a password refused by the provider\'s policy', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(UPDATE_USER, {
                status: 422,
                body: { code: 422, error_code: 'weak_password', msg: 'Password is too weak' },
            });

            await expect(
                provider.changePassword(jwtDeTest(), REFRESH, 'MotDePasseFaible1'),
            ).resolves.toBe('weak-password');
        });

        it('fails if revoking the other sessions breaks down', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(UPDATE_USER, { status: 200, body: UTILISATEUR });
            serveur.quand(LOGOUT, {
                status: 500,
                body: { code: 500, error_code: 'unexpected_failure', msg: 'panne' },
            });

            await expect(
                provider.changePassword(jwtDeTest(), REFRESH, 'NouveauMotDePasse2'),
            ).rejects.toMatchObject({ name: 'ServiceUnavailable', operation: 'identity provider: changePassword' });
        });

        it('never interpolates the password in the message of an outage', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(UPDATE_USER, {
                status: 500,
                body: { code: 500, error_code: 'unexpected_failure', msg: 'panne' },
            });

            const erreur = await provider
                .changePassword(jwtDeTest(), REFRESH, 'MotDePasseTresSecret2')
                .catch((error: unknown) => error);

            expect((erreur as Error).message).not.toContain('MotDePasseTresSecret2');
        });
    });

    describe('changeEmail', () => {
        it('asks for a confirmation when the provider accepts', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(UPDATE_USER, { status: 200, body: UTILISATEUR });

            await expect(
                provider.changeEmail(jwtDeTest(), REFRESH, 'alice.neuf@example.test'),
            ).resolves.toBe('confirmation-requested');
        });

        it('reports an address already registered without telling it apart otherwise', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(UPDATE_USER, {
                status: 422,
                body: {
                    code: 422,
                    error_code: 'email_exists',
                    msg: 'Email address already registered',
                },
            });

            await expect(provider.changeEmail(jwtDeTest(), REFRESH, 'bob@example.test')).resolves.toBe(
                'address-unavailable',
            );
        });

        it('absorbs the provider\'s sending limit', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(UPDATE_USER, {
                status: 429,
                body: { code: 429, error_code: 'over_email_send_rate_limit', msg: 'trop d envois' },
            });

            await expect(
                provider.changeEmail(jwtDeTest(), REFRESH, 'alice.neuf@example.test'),
            ).resolves.toBe('confirmation-requested');
        });

        it('propagates an unexpected provider outage', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(UPDATE_USER, {
                status: 500,
                body: { code: 500, error_code: 'unexpected_failure', msg: 'panne' },
            });

            await expect(
                provider.changeEmail(jwtDeTest(), REFRESH, 'alice.neuf@example.test'),
            ).rejects.toMatchObject({ name: 'ServiceUnavailable', operation: 'identity provider: changeEmail' });
        });
    });

    describe('confirmEmailChange', () => {
        it('confirms a valid token', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(VERIFY, { status: 200, body: SESSION });

            await expect(provider.confirmEmailChange('jeton-de-confirmation')).resolves.toBe(
                'confirmed',
            );
        });

        it('rejects an expired or unknown token', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(VERIFY, {
                status: 403,
                body: { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' },
            });

            await expect(provider.confirmEmailChange('jeton-perime')).resolves.toBe('token-rejected');
        });

        it('never interpolates the token in the message of an outage', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(VERIFY, {
                status: 500,
                body: { code: 500, error_code: 'unexpected_failure', msg: 'panne' },
            });

            const erreur = await provider
                .confirmEmailChange('jeton-tres-secret')
                .catch((error: unknown) => error);

            expect((erreur as Error).message).not.toContain('jeton-tres-secret');
        });
    });
});
