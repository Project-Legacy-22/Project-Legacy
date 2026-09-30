import { afterEach, describe, expect, it } from 'vitest';

import { PRIVACY_POLICY_VERSION } from '@legacy/contracts';

import { createSupabaseIdentityProvider } from './supabase-identity-provider.js';
// The GoTrue double lives in test/fakes, like the other reference doubles: this file is no longer
// the only one that needs it.
import {
    ADMIN_DELETE,
    LOGOUT,
    RECOVER,
    SESSION,
    ADMIN_CREATE,
    TOKEN,
    UPDATE_USER,
    USER,
    UTILISATEUR,
    VERIFY,
    fauxFournisseur,
} from '../test/fakes/gotrue-server.js';
import type { FauxFournisseur } from '../test/fakes/gotrue-server.js';

describe('adaptateur Supabase Auth', () => {
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

    describe('register', () => {
        it('reports a created account', async () => {
            const { provider, faux: serveur } = await adaptateur();
            // Registration goes through the admin API: signUp asks GoTrue to send a confirmation
            // email as soon as the target project is set to confirm, which made every registration
            // on the deployment answer 500.
            serveur.quand(ADMIN_CREATE, { status: 200, body: UTILISATEUR });

            await expect(provider.register('alice@example.test', 'MotDePasse2026', PRIVACY_POLICY_VERSION)).resolves.toBe(
                'created',
            );
        });

        it('reports an address already registered rather than failing', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(ADMIN_CREATE, {
                status: 422,
                body: { code: 422, error_code: 'email_exists', msg: 'Email address already registered' },
            });

            await expect(provider.register('alice@example.test', 'MotDePasse2026', PRIVACY_POLICY_VERSION)).resolves.toBe(
                'already-registered',
            );
        });

        // A provider outage must not look like an ordinary refusal.
        it('propagates an unexpected provider error', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(ADMIN_CREATE, {
                status: 503,
                body: { code: 503, error_code: 'service_unavailable', msg: 'indisponible' },
            });

            await expect(provider.register('alice@example.test', 'MotDePasse2026', PRIVACY_POLICY_VERSION)).rejects.toMatchObject({ name: 'ServiceUnavailable', operation: 'identity provider: register' });
        });
    });

    describe('authenticate', () => {
        it('refuses an unconfirmed address instead of failing', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(TOKEN, {
                status: 400,
                body: { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' },
            });

            await expect(
                provider.authenticate('alice@example.test', 'MotDePasse2026'),
            ).resolves.toBeUndefined();
        });

        it('returns the session and the account of the caller', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(TOKEN, { status: 200, body: SESSION });

            const session = await provider.authenticate('alice@example.test', 'MotDePasse2026');

            expect(session).toEqual({
                account: { id: UTILISATEUR.id, email: UTILISATEUR.email },
                accessToken: 'jeton-acces',
                refreshToken: 'jeton-rafraichissement',
                expiresInSeconds: 3600,
            });
        });

        it('returns nobody for refused credentials', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(TOKEN, {
                status: 400,
                body: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
            });

            await expect(
                provider.authenticate('alice@example.test', 'MauvaisMotDePasse1'),
            ).resolves.toBeUndefined();
        });

        it('propagates an unexpected provider error', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(TOKEN, {
                status: 500,
                body: { code: 500, error_code: 'unexpected_failure', msg: 'panne' },
            });

            await expect(
                provider.authenticate('alice@example.test', 'MotDePasse2026'),
            ).rejects.toMatchObject({ name: 'ServiceUnavailable', operation: 'identity provider: authenticate' });
        });
    });

    describe('identify', () => {
        it('recognises the bearer of a valid token', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(USER, { status: 200, body: UTILISATEUR });

            await expect(provider.identify('jeton-acces')).resolves.toEqual({
                id: UTILISATEUR.id,
                email: UTILISATEUR.email,
            });
        });

        it('recognises nobody behind an unreadable token', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(USER, {
                status: 403,
                body: { code: 403, error_code: 'bad_jwt', msg: 'invalid JWT' },
            });

            await expect(provider.identify('jeton-casse')).resolves.toBeUndefined();
        });

        it('propagates an outage rather than passing it off as a missing session', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(USER, {
                status: 500,
                body: { code: 500, error_code: 'unexpected_failure', msg: 'panne' },
            });

            await expect(provider.identify('jeton-acces')).rejects.toMatchObject({ name: 'ServiceUnavailable', operation: 'identity provider: identify' });
        });
    });

    describe('remove', () => {
        it('deletes the account the provider holds', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(ADMIN_DELETE, { status: 200, body: UTILISATEUR });

            await expect(provider.remove(UTILISATEUR.id)).resolves.toBeUndefined();
        });

        // Erasure deletes the rows before the credentials. An attempt interrupted between the two
        // must be able to run again, so an account already gone is a success and not an error to
        // report.
        it('takes as done an account the provider no longer holds', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(ADMIN_DELETE, {
                status: 404,
                body: { code: 404, error_code: 'user_not_found', msg: 'User not found' },
            });

            await expect(provider.remove(UTILISATEUR.id)).resolves.toBeUndefined();
        });

        it('propagates an outage rather than passing it off as an erasure', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(ADMIN_DELETE, {
                status: 503,
                body: { code: 503, error_code: 'unexpected_failure', msg: 'panne' },
            });

            await expect(provider.remove(UTILISATEUR.id)).rejects.toMatchObject({ name: 'ServiceUnavailable', operation: 'identity provider: remove' });
        });
    });

    describe('requestPasswordReset', () => {
        it('resolves when the provider accepts the request', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(RECOVER, { status: 200, body: {} });

            await expect(provider.requestPasswordReset('alice@example.test')).resolves.toBeUndefined();
        });

        // GoTrue answers 200 for an unknown address so as not to disclose who has an account. The
        // adapter must therefore not treat it as a failure.
        it('also resolves when the address has no account', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(RECOVER, { status: 200, body: {} });

            await expect(provider.requestPasswordReset('inconnu@example.test')).resolves.toBeUndefined();
        });

        it('absorbs the provider\'s sending limit without raising it', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(RECOVER, {
                status: 429,
                body: { code: 429, error_code: 'over_email_send_rate_limit', msg: 'trop d envois' },
            });

            await expect(provider.requestPasswordReset('alice@example.test')).resolves.toBeUndefined();
        });

        it('propagates an unexpected provider outage', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(RECOVER, {
                status: 500,
                body: { code: 500, error_code: 'unexpected_failure', msg: 'panne' },
            });

            await expect(provider.requestPasswordReset('alice@example.test')).rejects.toMatchObject({ name: 'ServiceUnavailable', operation: 'identity provider: requestPasswordReset' });
        });
    });

    describe('resetPassword', () => {
        function armeLeSucces(serveur: FauxFournisseur) {
            serveur.quand(VERIFY, { status: 200, body: SESSION });
            serveur.quand(UPDATE_USER, { status: 200, body: UTILISATEUR });
            serveur.quand(LOGOUT, { status: 204, body: {} });
        }

        it('changes the password and revokes the sessions', async () => {
            const { provider, faux: serveur } = await adaptateur();
            armeLeSucces(serveur);

            await expect(
                provider.resetPassword('jeton-de-recuperation', 'NouveauMotDePasse2'),
            ).resolves.toBe('password-changed');
        });

        it('rejects an expired or unknown token', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(VERIFY, {
                status: 403,
                body: { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' },
            });

            await expect(provider.resetPassword('jeton-perime', 'NouveauMotDePasse2')).resolves.toBe(
                'token-rejected',
            );
        });

        it('reports a password refused by the provider\'s policy', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(VERIFY, { status: 200, body: SESSION });
            serveur.quand(UPDATE_USER, {
                status: 422,
                body: { code: 422, error_code: 'weak_password', msg: 'Password is too weak' },
            });

            await expect(provider.resetPassword('jeton', 'MotDePasseFaible1')).resolves.toBe(
                'weak-password',
            );
        });

        // The revocation having already invalidated the access token, GoTrue may answer 401 on
        // logout: the password did change.
        it('remains a success if the revocation returns a token already invalid', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(VERIFY, { status: 200, body: SESSION });
            serveur.quand(UPDATE_USER, { status: 200, body: UTILISATEUR });
            serveur.quand(LOGOUT, {
                status: 401,
                body: { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' },
            });

            await expect(provider.resetPassword('jeton', 'NouveauMotDePasse2')).resolves.toBe(
                'password-changed',
            );
        });

        it('fails rather than claiming success when the revocation breaks down', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(VERIFY, { status: 200, body: SESSION });
            serveur.quand(UPDATE_USER, { status: 200, body: UTILISATEUR });
            serveur.quand(LOGOUT, {
                status: 500,
                body: { code: 500, error_code: 'unexpected_failure', msg: 'panne' },
            });

            await expect(provider.resetPassword('jeton', 'NouveauMotDePasse2')).rejects.toMatchObject({ name: 'ServiceUnavailable', operation: 'identity provider: resetPassword' });
        });

        it('never interpolates the token in the message of an outage', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(VERIFY, {
                status: 500,
                body: { code: 500, error_code: 'unexpected_failure', msg: 'panne' },
            });

            const erreur = await provider
                .resetPassword('jeton-tres-secret', 'NouveauMotDePasse2')
                .catch((error: unknown) => error);

            expect((erreur as Error).message).not.toContain('jeton-tres-secret');
        });
    });
});
