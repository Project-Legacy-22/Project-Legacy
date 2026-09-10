import { afterEach, describe, expect, it } from 'vitest';

import { PRIVACY_POLICY_VERSION } from '@legacy/contracts';

import { createSupabaseIdentityProvider } from './supabase-identity-provider.js';
// La doublure de GoTrue vit dans test/fakes, comme les autres doublures de
// reference : ce fichier n est plus le seul a en avoir besoin.
import {
    ADMIN_DELETE,
    LOGOUT,
    RECOVER,
    SESSION,
    SIGNUP,
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
        it('signale un compte cree', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(SIGNUP, { status: 200, body: SESSION });

            await expect(provider.register('alice@example.test', 'MotDePasse2026', PRIVACY_POLICY_VERSION)).resolves.toBe(
                'created',
            );
        });

        it('signale une adresse deja enregistree plutot que d echouer', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(SIGNUP, {
                status: 422,
                body: { code: 422, error_code: 'user_already_exists', msg: 'User already registered' },
            });

            await expect(provider.register('alice@example.test', 'MotDePasse2026', PRIVACY_POLICY_VERSION)).resolves.toBe(
                'already-registered',
            );
        });

        // Une panne du fournisseur ne doit pas ressembler a un refus ordinaire.
        it('propage une erreur inattendue du fournisseur', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(SIGNUP, {
                status: 503,
                body: { code: 503, error_code: 'service_unavailable', msg: 'indisponible' },
            });

            await expect(provider.register('alice@example.test', 'MotDePasse2026', PRIVACY_POLICY_VERSION)).rejects.toThrow(
                /register/,
            );
        });
    });

    describe('authenticate', () => {
        it('rend la session et le compte de l appelant', async () => {
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

        it('ne rend personne sur des identifiants refuses', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(TOKEN, {
                status: 400,
                body: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
            });

            await expect(
                provider.authenticate('alice@example.test', 'MauvaisMotDePasse1'),
            ).resolves.toBeUndefined();
        });

        it('propage une erreur inattendue du fournisseur', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(TOKEN, {
                status: 500,
                body: { code: 500, error_code: 'unexpected_failure', msg: 'panne' },
            });

            await expect(
                provider.authenticate('alice@example.test', 'MotDePasse2026'),
            ).rejects.toThrow(/authenticate/);
        });
    });

    describe('identify', () => {
        it('reconnait le porteur d un jeton valide', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(USER, { status: 200, body: UTILISATEUR });

            await expect(provider.identify('jeton-acces')).resolves.toEqual({
                id: UTILISATEUR.id,
                email: UTILISATEUR.email,
            });
        });

        it('ne reconnait personne derriere un jeton illisible', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(USER, {
                status: 403,
                body: { code: 403, error_code: 'bad_jwt', msg: 'invalid JWT' },
            });

            await expect(provider.identify('jeton-casse')).resolves.toBeUndefined();
        });

        it('propage une panne plutot que de la faire passer pour une session absente', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(USER, {
                status: 500,
                body: { code: 500, error_code: 'unexpected_failure', msg: 'panne' },
            });

            await expect(provider.identify('jeton-acces')).rejects.toThrow(/identify/);
        });
    });

    describe('remove', () => {
        it('supprime le compte que le fournisseur detient', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(ADMIN_DELETE, { status: 200, body: UTILISATEUR });

            await expect(provider.remove(UTILISATEUR.id)).resolves.toBeUndefined();
        });

        // L effacement supprime les lignes avant les identifiants. Une tentative
        // interrompue entre les deux doit pouvoir etre relancee, donc un compte
        // deja parti est un succes et non une erreur a signaler.
        it('tient pour fait un compte que le fournisseur ne detient plus', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(ADMIN_DELETE, {
                status: 404,
                body: { code: 404, error_code: 'user_not_found', msg: 'User not found' },
            });

            await expect(provider.remove(UTILISATEUR.id)).resolves.toBeUndefined();
        });

        it('propage une panne plutot que de la faire passer pour un effacement', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(ADMIN_DELETE, {
                status: 503,
                body: { code: 503, error_code: 'unexpected_failure', msg: 'panne' },
            });

            await expect(provider.remove(UTILISATEUR.id)).rejects.toThrow(/remove/);
        });
    });

    describe('requestPasswordReset', () => {
        it('resout quand le fournisseur accepte la demande', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(RECOVER, { status: 200, body: {} });

            await expect(provider.requestPasswordReset('alice@example.test')).resolves.toBeUndefined();
        });

        // GoTrue repond 200 pour une adresse inconnue afin de ne pas divulguer
        // qui a un compte. L adaptateur ne doit donc pas la traiter en echec.
        it('resout aussi quand l adresse n a pas de compte', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(RECOVER, { status: 200, body: {} });

            await expect(provider.requestPasswordReset('inconnu@example.test')).resolves.toBeUndefined();
        });

        it('absorbe la limite d envoi du fournisseur sans la faire remonter', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(RECOVER, {
                status: 429,
                body: { code: 429, error_code: 'over_email_send_rate_limit', msg: 'trop d envois' },
            });

            await expect(provider.requestPasswordReset('alice@example.test')).resolves.toBeUndefined();
        });

        it('propage une panne inattendue du fournisseur', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(RECOVER, {
                status: 500,
                body: { code: 500, error_code: 'unexpected_failure', msg: 'panne' },
            });

            await expect(provider.requestPasswordReset('alice@example.test')).rejects.toThrow(
                /requestPasswordReset/,
            );
        });
    });

    describe('resetPassword', () => {
        function armeLeSucces(serveur: FauxFournisseur) {
            serveur.quand(VERIFY, { status: 200, body: SESSION });
            serveur.quand(UPDATE_USER, { status: 200, body: UTILISATEUR });
            serveur.quand(LOGOUT, { status: 204, body: {} });
        }

        it('change le mot de passe et revoque les sessions', async () => {
            const { provider, faux: serveur } = await adaptateur();
            armeLeSucces(serveur);

            await expect(
                provider.resetPassword('jeton-de-recuperation', 'NouveauMotDePasse2'),
            ).resolves.toBe('password-changed');
        });

        it('rejette un jeton expire ou inconnu', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(VERIFY, {
                status: 403,
                body: { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' },
            });

            await expect(provider.resetPassword('jeton-perime', 'NouveauMotDePasse2')).resolves.toBe(
                'token-rejected',
            );
        });

        it('signale un mot de passe refuse par la politique du fournisseur', async () => {
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

        // La revocation ayant deja invalide le jeton d acces, GoTrue peut
        // repondre 401 sur le logout : le mot de passe a bien change.
        it('reste un succes si la revocation renvoie un jeton deja invalide', async () => {
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

        it('echoue plutot que de pretendre au succes quand la revocation tombe en panne', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(VERIFY, { status: 200, body: SESSION });
            serveur.quand(UPDATE_USER, { status: 200, body: UTILISATEUR });
            serveur.quand(LOGOUT, {
                status: 500,
                body: { code: 500, error_code: 'unexpected_failure', msg: 'panne' },
            });

            await expect(provider.resetPassword('jeton', 'NouveauMotDePasse2')).rejects.toThrow(
                /resetPassword/,
            );
        });

        it('n interpole jamais le jeton dans le message d une panne', async () => {
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
