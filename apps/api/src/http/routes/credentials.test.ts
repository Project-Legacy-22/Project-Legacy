import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    makeChangeEmail,
    makeChangePassword,
    makeConfirmEmailChange,
    makeIdentifyCaller,
    makeRenewSession,
    makeSignIn,
} from '@legacy/core-auth';

import { inMemoryCompromisedPasswords } from '../../../../../packages/core/auth/test/fakes/in-memory-compromised-passwords.js';
import { inMemoryIdentityProvider } from '../../../../../packages/core/auth/test/fakes/in-memory-identity-provider.js';
import type { InMemoryIdentityProvider } from '../../../../../packages/core/auth/test/fakes/in-memory-identity-provider.js';
import { recordingLogger } from '../../../../../packages/contracts/test/fakes/recording-logger.js';
import { createServer } from '../server.js';
import type { AppUseCases } from '../../composition-root.js';
import { json, listen, testConfig } from '../../../test/http-harness.js';
import type { Harness } from '../../../test/http-harness.js';
import { makeAppUseCases } from '../../../test/fakes/app-use-cases.js';

async function repeter(fois: number, tentative: () => Promise<Response>): Promise<Response[]> {
    const reponses: Response[] = [];
    for (let essai = 0; essai < fois; essai += 1) reponses.push(await tentative());
    return reponses;
}

const ADRESSE = 'alice@example.com';
const ANCIEN = 'AncienMotDePasse1';
const NOUVEAU = 'NouveauMotDePasse2';
const NEUVE = 'alice.neuf@example.com';
const KNOWN_BREACHED = 'MotDePasseCompromis1';
const PRISE = 'bob@example.com';

const COMPTES = [
    { id: '00000000-0000-7000-8000-000000000001', email: ADRESSE, password: ANCIEN },
    { id: '00000000-0000-7000-8000-000000000002', email: PRISE, password: 'AutreMotDePasse3' },
];

function useCasesOver(provider: InMemoryIdentityProvider, compromised: string[]): AppUseCases {
    return makeAppUseCases({
        auth: {
            signIn: makeSignIn(provider),
            identifyCaller: makeIdentifyCaller(provider),
            renewSession: makeRenewSession(provider),
            changePassword: makeChangePassword({
                provider,
                compromisedPasswords: inMemoryCompromisedPasswords(compromised),
            }),
            changeEmail: makeChangeEmail(provider),
            confirmEmailChange: makeConfirmEmailChange(provider),
        },
    });
}

describe('credentials change API', () => {
    let harness: Harness;
    let provider: InMemoryIdentityProvider;

    async function serve(compromised: string[] = []) {
        const logger = recordingLogger();
        provider = inMemoryIdentityProvider(COMPTES);
        harness = await listen(
            createServer(testConfig, useCasesOver(provider, compromised), { logger: logger }),
            logger,
        );
    }

    // Both cookies: the credential routes act as the caller against the
    // provider, so they need the refresh token as well as the access token, and
    // a browser always sends the pair.
    async function sessionDe(email: string, password: string): Promise<string> {
        const connexion = await harness.request('/auth/login', json('POST', { email, password }));
        return connexion.headers
            .getSetCookie()
            .map(entree => entree.split(';')[0] ?? '')
            .join('; ');
    }

    function avec(cookie: string, init: ReturnType<typeof json>): ReturnType<typeof json> {
        return { ...init, headers: { ...init.headers, Cookie: cookie } };
    }

    beforeEach(() => serve());
    afterEach(() => harness.close());

    describe('PUT /auth/me/password', () => {
        it('refuses a call without a session', async () => {
            const reponse = await harness.request(
                '/auth/me/password',
                json('PUT', { currentPassword: ANCIEN, newPassword: NOUVEAU }),
            );

            expect(reponse.status).toBe(401);
        });

        it('refuses a wrong current password without revealing anything', async () => {
            const cookie = await sessionDe(ADRESSE, ANCIEN);

            const reponse = await harness.request(
                '/auth/me/password',
                avec(cookie, json('PUT', { currentPassword: 'PasLeBon9A', newPassword: NOUVEAU })),
            );

            expect(reponse.status).toBe(403);
            expect((await reponse.json()) as { type: string }).toMatchObject({
                type: 'incorrect_current_password',
            });
            // The old password still works.
            expect((await harness.request('/auth/login', json('POST', { email: ADRESSE, password: ANCIEN }))).status).toBe(200);
        });

        it('refuses a new password that is too short or compromised', async () => {
            await serve([KNOWN_BREACHED]);
            const cookie = await sessionDe(ADRESSE, ANCIEN);

            const court = await harness.request(
                '/auth/me/password',
                avec(cookie, json('PUT', { currentPassword: ANCIEN, newPassword: 'Court1' })),
            );
            const compromis = await harness.request(
                '/auth/me/password',
                avec(cookie, json('PUT', { currentPassword: ANCIEN, newPassword: KNOWN_BREACHED })),
            );

            expect(court.status).toBe(400);
            expect((await compromis.json()) as { type: string }).toMatchObject({
                type: 'compromised_password',
            });
        });

        it('changes the password, keeps the current session and revokes the others', async () => {
            const autreCookie = await sessionDe(ADRESSE, ANCIEN);
            const cookie = await sessionDe(ADRESSE, ANCIEN);

            const reponse = await harness.request(
                '/auth/me/password',
                avec(cookie, json('PUT', { currentPassword: ANCIEN, newPassword: NOUVEAU })),
            );

            expect(reponse.status).toBe(204);
            expect(reponse.headers.get('set-cookie')).toBeNull();
            // A token issued before the change is no longer accepted.
            expect((await harness.request('/auth/me', { headers: { Cookie: autreCookie } })).status).toBe(401);
            // The session that asked for the change stays usable.
            expect((await harness.request('/auth/me', { headers: { Cookie: cookie } })).status).toBe(200);
        });

        it('keeps the address and the passwords out of the logs', async () => {
            const cookie = await sessionDe(ADRESSE, ANCIEN);
            await harness.request(
                '/auth/me/password',
                avec(cookie, json('PUT', { currentPassword: ANCIEN, newPassword: NOUVEAU })),
            );

            const journal = JSON.stringify(harness.logger.lines);
            expect(journal).not.toContain(ADRESSE);
            expect(journal).not.toContain(ANCIEN);
            expect(journal).not.toContain(NOUVEAU);
        });

        it('refuses a missing body rather than failing with a 500', async () => {
            const cookie = await sessionDe(ADRESSE, ANCIEN);

            const reponse = await harness.request('/auth/me/password', {
                method: 'PUT',
                headers: { Cookie: cookie },
            });

            expect(reponse.status).toBe(400);
            expect(harness.logger.lines.map(ligne => ligne.level)).not.toContain('error');
        });
    });

    describe('PUT /auth/me/email', () => {
        it('refuses a call without a session', async () => {
            const reponse = await harness.request(
                '/auth/me/email',
                json('PUT', { newEmail: NEUVE }),
            );

            expect(reponse.status).toBe(401);
        });

        it('answers identically for a free address and an address already taken', async () => {
            const cookie = await sessionDe(ADRESSE, ANCIEN);

            const surLibre = await harness.request(
                '/auth/me/email',
                avec(cookie, json('PUT', { newEmail: NEUVE })),
            );
            const surPrise = await harness.request(
                '/auth/me/email',
                avec(cookie, json('PUT', { newEmail: PRISE })),
            );

            expect(surLibre.status).toBe(202);
            expect(surPrise.status).toBe(surLibre.status);
            expect(await surPrise.text()).toBe(await surLibre.text());
        });

        it('limits the requests per target address', async () => {
            const cookie = await sessionDe(ADRESSE, ANCIEN);
            const demande = () =>
                harness.request('/auth/me/email', avec(cookie, json('PUT', { newEmail: NEUVE })));

            const reponses = await repeter(4, demande);

            expect(reponses.slice(0, 3).map(r => r.status)).toEqual([202, 202, 202]);
            expect(reponses[3]?.status).toBe(429);
        });

        it('keeps both the old and the new address out of the logs', async () => {
            const cookie = await sessionDe(ADRESSE, ANCIEN);
            await harness.request('/auth/me/email', avec(cookie, json('PUT', { newEmail: NEUVE })));

            const journal = JSON.stringify(harness.logger.lines);
            expect(journal).not.toContain(ADRESSE);
            expect(journal).not.toContain(NEUVE);
        });
    });

    describe('POST /auth/me/email/confirm', () => {
        it('confirms the change: the new address becomes the identifier', async () => {
            const cookie = await sessionDe(ADRESSE, ANCIEN);
            await harness.request('/auth/me/email', avec(cookie, json('PUT', { newEmail: NEUVE })));
            const token = provider.emailChangeTokenFor(ADRESSE) ?? '';

            const reponse = await harness.request(
                '/auth/me/email/confirm',
                json('POST', { token }),
            );

            expect(reponse.status).toBe(204);
            expect(reponse.headers.get('set-cookie')).toBeNull();
            expect((await harness.request('/auth/login', json('POST', { email: NEUVE, password: ANCIEN }))).status).toBe(200);
        });

        it('refuses an unknown token or one already used', async () => {
            const cookie = await sessionDe(ADRESSE, ANCIEN);
            await harness.request('/auth/me/email', avec(cookie, json('PUT', { newEmail: NEUVE })));
            const token = provider.emailChangeTokenFor(ADRESSE) ?? '';

            const premier = await harness.request('/auth/me/email/confirm', json('POST', { token }));
            const rejoue = await harness.request('/auth/me/email/confirm', json('POST', { token }));
            const invente = await harness.request(
                '/auth/me/email/confirm',
                json('POST', { token: 'jamais-emis' }),
            );

            expect(premier.status).toBe(204);
            expect(rejoue.status).toBe(400);
            expect((await rejoue.json()) as { type: string }).toMatchObject({
                type: 'invalid_email_change_token',
            });
            expect(invente.status).toBe(400);
        });

        it('keeps the token out of the logs and the response', async () => {
            const reponse = await harness.request(
                '/auth/me/email/confirm',
                json('POST', { token: 'jeton-tres-secret' }),
            );

            expect(await reponse.text()).not.toContain('jeton-tres-secret');
            expect(JSON.stringify(harness.logger.lines)).not.toContain('jeton-tres-secret');
        });
    });

    describe('GET /confirm-email-change', () => {
        it('serves the application shell for the confirmation link', async () => {
            const reponse = await harness.request(
                '/confirm-email-change?token_hash=abc&type=email_change',
            );

            expect(reponse.status).toBe(200);
            expect(reponse.headers.get('content-type')).toContain('text/html');
        });
    });
});
