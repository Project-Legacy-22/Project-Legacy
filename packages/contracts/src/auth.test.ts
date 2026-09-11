import { describe, expect, it } from 'vitest';

import {
    ChangeEmailBody,
    ChangePasswordBody,
    ConfirmEmailChangeBody,
    PASSWORD_POLICY,
    PRIVACY_POLICY_VERSION,
    RegisterAccountBody,
    RequestPasswordResetBody,
    ResetPasswordBody,
    SignInBody,
} from './auth.js';

describe('RegisterAccountBody', () => {
    it('canonicalise l adresse avant de la rendre', () => {
        const parsed = RegisterAccountBody.parse({
            email: '  Alice@Example.COM ',
            password: 'MotDePasse2026',
            acceptsPrivacyPolicy: true,
            policyVersion: PRIVACY_POLICY_VERSION,
        });

        expect(parsed.email).toBe('alice@example.com');
    });

    it('refuse un mot de passe plus court que la politique', () => {
        expect(() =>
            RegisterAccountBody.parse({
                email: 'alice@example.com',
                password: 'Court1',
                acceptsPrivacyPolicy: true,
                policyVersion: PRIVACY_POLICY_VERSION,
            }),
        ).toThrow();
    });
});

describe('RequestPasswordResetBody', () => {
    it('n exige rien d autre qu une adresse', () => {
        const parsed = RequestPasswordResetBody.parse({ email: 'ALICE@example.com' });

        expect(parsed).toEqual({ email: 'alice@example.com' });
    });

    it('refuse une adresse qui n en est pas une', () => {
        expect(() => RequestPasswordResetBody.parse({ email: 'pas-une-adresse' })).toThrow();
    });
});

describe('ResetPasswordBody', () => {
    it('accepte un jeton opaque et un mot de passe conforme a la politique', () => {
        const parsed = ResetPasswordBody.parse({
            token: 'peu-importe-la-forme',
            password: 'NouveauMotDePasse1',
        });

        expect(parsed).toEqual({
            token: 'peu-importe-la-forme',
            password: 'NouveauMotDePasse1',
        });
    });

    // Contrairement a la connexion, ce mot de passe n existe pas encore : la
    // politique complete s applique des la frontiere.
    it('refuse un mot de passe plus court que la politique', () => {
        expect(() =>
            ResetPasswordBody.parse({ token: 'jeton', password: 'x'.repeat(PASSWORD_POLICY.minimumLength - 1) }),
        ).toThrow();
    });

    it('refuse une demande sans jeton', () => {
        expect(() => ResetPasswordBody.parse({ token: '', password: 'NouveauMotDePasse1' })).toThrow();
    });
});

describe('SignInBody', () => {
    it('n impose pas la politique a un mot de passe deja existant', () => {
        expect(() => SignInBody.parse({ email: 'alice@example.com', password: 'court' })).not.toThrow();
    });
});

describe('ChangePasswordBody (US-36)', () => {
    it('n exige du mot de passe actuel que sa presence', () => {
        const parsed = ChangePasswordBody.parse({
            currentPassword: 'x',
            newPassword: 'NouveauMotDePasse1',
        });

        expect(parsed.currentPassword).toBe('x');
    });

    it('refuse un mot de passe actuel vide', () => {
        expect(() =>
            ChangePasswordBody.parse({ currentPassword: '', newPassword: 'NouveauMotDePasse1' }),
        ).toThrow();
    });

    // Ce mot de passe n existe pas encore : la longueur minimale s applique des
    // la frontiere, comme pour une reinitialisation.
    it('refuse un nouveau mot de passe plus court que la politique', () => {
        expect(() =>
            ChangePasswordBody.parse({
                currentPassword: 'AncienMotDePasse1',
                newPassword: 'x'.repeat(PASSWORD_POLICY.minimumLength - 1),
            }),
        ).toThrow();
    });
});

describe('ChangeEmailBody (US-36)', () => {
    it('canonicalise la nouvelle adresse', () => {
        expect(ChangeEmailBody.parse({ newEmail: '  Bob@Example.COM ' })).toEqual({
            newEmail: 'bob@example.com',
        });
    });

    it('refuse une adresse qui n en est pas une', () => {
        expect(() => ChangeEmailBody.parse({ newEmail: 'pas-une-adresse' })).toThrow();
    });
});

describe('ConfirmEmailChangeBody (US-36)', () => {
    it('accepte un jeton opaque', () => {
        expect(ConfirmEmailChangeBody.parse({ token: 'peu-importe-la-forme' })).toEqual({
            token: 'peu-importe-la-forme',
        });
    });

    it('refuse une confirmation sans jeton', () => {
        expect(() => ConfirmEmailChangeBody.parse({ token: '' })).toThrow();
    });
});

describe('consentement a la politique (US-37)', () => {
    const valide = {
        email: 'alice@example.com',
        password: 'MotDePasse2026',
        acceptsPrivacyPolicy: true as const,
        policyVersion: PRIVACY_POLICY_VERSION,
    };

    it('accepte une inscription qui consent a la version publiee', () => {
        expect(RegisterAccountBody.parse(valide).policyVersion).toBe(PRIVACY_POLICY_VERSION);
    });

    // literal(true) plutot que boolean() : false et l absence du champ sont
    // refuses tous les deux, et le champ est nomme dans l erreur.
    it('refuse un consentement absent ou negatif', () => {
        expect(() =>
            RegisterAccountBody.parse({
                email: valide.email,
                password: valide.password,
                policyVersion: valide.policyVersion,
            }),
        ).toThrow();
        expect(() =>
            RegisterAccountBody.parse({ ...valide, acceptsPrivacyPolicy: false }),
        ).toThrow();
    });

    // Un formulaire laisse ouvert pendant une mise a jour enregistrerait sinon
    // un consentement a un texte que personne n a lu.
    it('refuse une version qui n est pas celle publiee', () => {
        expect(() => RegisterAccountBody.parse({ ...valide, policyVersion: '2020-01-01' })).toThrow();
    });
});
