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

describe('adaptateur Supabase Auth, changement d identifiants', () => {
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
        it('pose le nouveau mot de passe et revoque les autres sessions', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(UPDATE_USER, { status: 200, body: UTILISATEUR });
            serveur.quand(LOGOUT, { status: 204, body: {} });

            await expect(
                provider.changePassword(jwtDeTest(), REFRESH, 'NouveauMotDePasse2'),
            ).resolves.toBe('password-changed');
        });

        it('signale un mot de passe refuse par la politique du fournisseur', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(UPDATE_USER, {
                status: 422,
                body: { code: 422, error_code: 'weak_password', msg: 'Password is too weak' },
            });

            await expect(
                provider.changePassword(jwtDeTest(), REFRESH, 'MotDePasseFaible1'),
            ).resolves.toBe('weak-password');
        });

        it('echoue si la revocation des autres sessions tombe en panne', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(UPDATE_USER, { status: 200, body: UTILISATEUR });
            serveur.quand(LOGOUT, {
                status: 500,
                body: { code: 500, error_code: 'unexpected_failure', msg: 'panne' },
            });

            await expect(
                provider.changePassword(jwtDeTest(), REFRESH, 'NouveauMotDePasse2'),
            ).rejects.toThrow(/changePassword/);
        });

        it('n interpole jamais le mot de passe dans le message d une panne', async () => {
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
        it('demande une confirmation quand le fournisseur accepte', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(UPDATE_USER, { status: 200, body: UTILISATEUR });

            await expect(
                provider.changeEmail(jwtDeTest(), REFRESH, 'alice.neuf@example.test'),
            ).resolves.toBe('confirmation-requested');
        });

        it('signale une adresse deja enregistree sans la distinguer autrement', async () => {
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

        it('absorbe la limite d envoi du fournisseur', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(UPDATE_USER, {
                status: 429,
                body: { code: 429, error_code: 'over_email_send_rate_limit', msg: 'trop d envois' },
            });

            await expect(
                provider.changeEmail(jwtDeTest(), REFRESH, 'alice.neuf@example.test'),
            ).resolves.toBe('confirmation-requested');
        });

        it('propage une panne inattendue du fournisseur', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(UPDATE_USER, {
                status: 500,
                body: { code: 500, error_code: 'unexpected_failure', msg: 'panne' },
            });

            await expect(
                provider.changeEmail(jwtDeTest(), REFRESH, 'alice.neuf@example.test'),
            ).rejects.toThrow(/changeEmail/);
        });
    });

    describe('confirmEmailChange', () => {
        it('confirme un jeton valide', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(VERIFY, { status: 200, body: SESSION });

            await expect(provider.confirmEmailChange('jeton-de-confirmation')).resolves.toBe(
                'confirmed',
            );
        });

        it('rejette un jeton expire ou inconnu', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(VERIFY, {
                status: 403,
                body: { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' },
            });

            await expect(provider.confirmEmailChange('jeton-perime')).resolves.toBe('token-rejected');
        });

        it('n interpole jamais le jeton dans le message d une panne', async () => {
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
