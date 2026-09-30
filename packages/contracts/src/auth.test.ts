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
    it('canonicalises the address before returning it', () => {
        const parsed = RegisterAccountBody.parse({
            email: '  Alice@Example.COM ',
            password: 'MotDePasse2026',
            acceptsPrivacyPolicy: true,
            policyVersion: PRIVACY_POLICY_VERSION,
        });

        expect(parsed.email).toBe('alice@example.com');
    });

    it('refuses a password shorter than the policy', () => {
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
    it('requires nothing but an address', () => {
        const parsed = RequestPasswordResetBody.parse({ email: 'ALICE@example.com' });

        expect(parsed).toEqual({ email: 'alice@example.com' });
    });

    it('refuses an address that is not one', () => {
        expect(() => RequestPasswordResetBody.parse({ email: 'pas-une-adresse' })).toThrow();
    });
});

describe('ResetPasswordBody', () => {
    it('accepts an opaque token and a password that meets the policy', () => {
        const parsed = ResetPasswordBody.parse({
            token: 'peu-importe-la-forme',
            password: 'NouveauMotDePasse1',
        });

        expect(parsed).toEqual({
            token: 'peu-importe-la-forme',
            password: 'NouveauMotDePasse1',
        });
    });

    // Unlike sign-in, this password does not exist yet: the full policy applies at the boundary.
    it('refuses a password shorter than the policy', () => {
        expect(() =>
            ResetPasswordBody.parse({ token: 'jeton', password: 'x'.repeat(PASSWORD_POLICY.minimumLength - 1) }),
        ).toThrow();
    });

    it('refuses a request without a token', () => {
        expect(() => ResetPasswordBody.parse({ token: '', password: 'NouveauMotDePasse1' })).toThrow();
    });
});

describe('SignInBody', () => {
    it('does not impose the policy on a password that already exists', () => {
        expect(() => SignInBody.parse({ email: 'alice@example.com', password: 'court' })).not.toThrow();
    });
});

describe('ChangePasswordBody (US-36)', () => {
    it('only requires the current password to be present', () => {
        const parsed = ChangePasswordBody.parse({
            currentPassword: 'x',
            newPassword: 'NouveauMotDePasse1',
        });

        expect(parsed.currentPassword).toBe('x');
    });

    it('refuses an empty current password', () => {
        expect(() =>
            ChangePasswordBody.parse({ currentPassword: '', newPassword: 'NouveauMotDePasse1' }),
        ).toThrow();
    });

    // This password does not exist yet: the minimum length applies at the boundary, as for a reset.
    it('refuses a new password shorter than the policy', () => {
        expect(() =>
            ChangePasswordBody.parse({
                currentPassword: 'AncienMotDePasse1',
                newPassword: 'x'.repeat(PASSWORD_POLICY.minimumLength - 1),
            }),
        ).toThrow();
    });
});

describe('ChangeEmailBody (US-36)', () => {
    it('canonicalises the new address', () => {
        expect(ChangeEmailBody.parse({ newEmail: '  Bob@Example.COM ' })).toEqual({
            newEmail: 'bob@example.com',
        });
    });

    it('refuses an address that is not one', () => {
        expect(() => ChangeEmailBody.parse({ newEmail: 'pas-une-adresse' })).toThrow();
    });
});

describe('ConfirmEmailChangeBody (US-36)', () => {
    it('accepts an opaque token', () => {
        expect(ConfirmEmailChangeBody.parse({ token: 'peu-importe-la-forme' })).toEqual({
            token: 'peu-importe-la-forme',
        });
    });

    it('refuses a confirmation without a token', () => {
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

    it('accepts a registration that consents to the published version', () => {
        expect(RegisterAccountBody.parse(valide).policyVersion).toBe(PRIVACY_POLICY_VERSION);
    });

    // literal(true) rather than boolean(): false and a missing field are both refused, and the
    // field is named in the error.
    it('refuses a missing or negative consent', () => {
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

    // Otherwise a form left open during an update would record a consent to a text nobody read.
    it('refuses a version that is not the published one', () => {
        expect(() => RegisterAccountBody.parse({ ...valide, policyVersion: '2020-01-01' })).toThrow();
    });
});
