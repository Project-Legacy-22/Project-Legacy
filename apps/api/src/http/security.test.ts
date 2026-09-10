import { afterEach, describe, expect, it } from 'vitest';
import {
    makeEraseAccount,
    makeExportPersonalData,
    makeIdentifyCaller,
    makeRegisterAccount,
    makeRequestPasswordReset,
    makeResetPassword,
    makeSignIn,
    makeSignOut,
} from '@legacy/core-auth';
import type { IdentityProvider } from '@legacy/core-auth';
import { makeAddItem, makeChangeItem, makeListItems, makeRemoveItem } from '@legacy/core-items';
// The reference fakes for a port live with the port they implement; copying one
// here would let the copy drift from the contract it stands for.
import { inMemoryCompromisedPasswords } from '../../../../packages/core/auth/test/fakes/in-memory-compromised-passwords.js';
import { inMemoryIdentityProvider } from '../../../../packages/core/auth/test/fakes/in-memory-identity-provider.js';
import { inMemoryPersonalDataStore } from '../../../../packages/core/auth/test/fakes/in-memory-personal-data-store.js';

import { createServer } from './server.js';
import type { Config } from '../config.js';
import type { AppUseCases } from '../composition-root.js';
import { recordingLogger } from '../../../../packages/contracts/test/fakes/recording-logger.js';
import { unreachableItemRepository } from '../../test/fakes/unreachable-item-repository.js';
import { json, listen, testConfig } from '../../test/http-harness.js';
import type { Harness } from '../../test/http-harness.js';

const ORIGIN = testConfig.webOrigin;
const ADRESSE = 'alice@example.com';
const MOT_DE_PASSE = 'MotDePasse2026';

// A full set of use cases over in-memory fakes. `authenticate` can be swapped
// for one that fails, to exercise the path where an error the code never
// modelled reaches the boundary.
function appUseCases(authenticate?: IdentityProvider['authenticate']): AppUseCases {
    const provider = inMemoryIdentityProvider();
    const signInProvider: IdentityProvider =
        authenticate === undefined ? provider : { ...provider, authenticate };
    const repository = unreachableItemRepository();
    const personalData = inMemoryPersonalDataStore();

    return {
        items: {
            listItems: makeListItems(repository),
            addItem: makeAddItem({
                repository,
                newId: () => '00000000-0000-7000-8000-000000000009',
                now: () => new Date('2026-09-09T10:00:00.000Z'),
            }),
            changeItem: makeChangeItem(repository),
            removeItem: makeRemoveItem(repository),
        },
        // Required by AppUseCases since #202. This suite exercises headers,
        // CORS and body limits, never a notification route.
        notifications: {
            listNotifications: () => Promise.reject(new Error('not exercised by this suite')),
            markNotificationRead: () => Promise.reject(new Error('not exercised by this suite')),
            countUnread: () => Promise.reject(new Error('not exercised by this suite')),
        },
        auth: {
            registerAccount: makeRegisterAccount(provider),
            signIn: makeSignIn(signInProvider),
            identifyCaller: makeIdentifyCaller(provider),
            requestPasswordReset: makeRequestPasswordReset(provider),
            resetPassword: makeResetPassword({ provider, compromisedPasswords: inMemoryCompromisedPasswords() }),
            // Required by AuthUseCases since #174; no case here exercises it.
            signOut: makeSignOut(provider),
        },
        account: {
            exportPersonalData: makeExportPersonalData({
                store: personalData,
                now: () => new Date('2026-09-09T10:00:00.000Z'),
            }),
            eraseAccount: makeEraseAccount({ store: personalData, identity: provider }),
        },
    };
}

describe('durcissement de l API', () => {
    let harness: Harness;

    async function serve(
        overrides: Partial<Config> = {},
        authenticate?: IdentityProvider['authenticate'],
    ): Promise<void> {
        const logger = recordingLogger();
        const app = createServer({ ...testConfig, ...overrides }, appUseCases(authenticate), logger);
        harness = await listen(app, logger);
    }

    afterEach(() => harness.close());

    describe('en-tetes de securite', () => {
        it('pose une politique de securite du contenu restrictive sur chaque reponse', async () => {
            await serve();

            const response = await harness.request('/');
            const csp = response.headers.get('content-security-policy') ?? '';

            expect(csp).toContain("default-src 'self'");
            expect(csp).toContain("frame-ancestors 'none'");
            expect(csp).toContain("object-src 'none'");
        });

        it('interdit au navigateur de deviner le type de contenu', async () => {
            await serve();

            const response = await harness.request('/');

            expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        });

        it('n annonce pas le serveur applicatif', async () => {
            await serve();

            const response = await harness.request('/');

            expect(response.headers.get('x-powered-by')).toBeNull();
        });
    });

    describe('CORS', () => {
        it('renvoie l origine du front telle quelle, jamais un joker', async () => {
            await serve();

            const response = await harness.request('/auth/me', { headers: { Origin: ORIGIN } });

            expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
            expect(response.headers.get('access-control-allow-credentials')).toBe('true');
        });

        it('n autorise aucune autre origine', async () => {
            await serve();

            const response = await harness.request('/auth/me', {
                headers: { Origin: 'http://evil.example' },
            });

            expect(response.headers.get('access-control-allow-origin')).toBeNull();
        });

        it('repond au prevol sans le laisser atteindre une route', async () => {
            await serve();

            const autorise = await harness.request('/auth/login', {
                method: 'OPTIONS',
                headers: { Origin: ORIGIN },
            });
            const refuse = await harness.request('/auth/login', {
                method: 'OPTIONS',
                headers: { Origin: 'http://evil.example' },
            });

            expect(autorise.status).toBe(204);
            expect(autorise.headers.get('access-control-allow-origin')).toBe(ORIGIN);
            expect(refuse.status).toBe(204);
            expect(refuse.headers.get('access-control-allow-origin')).toBeNull();
        });
    });

    describe('borne sur la taille du corps', () => {
        it('refuse un corps trop gros par un 413 explicite, sans incident', async () => {
            await serve();

            const oversized = { email: ADRESSE, password: 'x'.repeat(20_000) };
            const response = await harness.request('/auth/login', json('POST', oversized));
            const body = (await response.json()) as { type: string };

            expect(response.status).toBe(413);
            expect(body.type).toBe('payload_too_large');
            expect(harness.logger.lines.map(line => line.level)).not.toContain('error');
        });

        it('refuse un corps JSON malforme par un 400, pas un 500', async () => {
            await serve();

            const response = await harness.request('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{"email": "alice@example.com"',
            });
            const body = (await response.json()) as { type: string };

            expect(response.status).toBe(400);
            expect(body.type).toBe('malformed_body');
            expect(harness.logger.lines.map(line => line.level)).not.toContain('error');
        });
    });

    describe('non-divulgation dans les erreurs', () => {
        it('reduit une panne interne a un message generique, la cause restant au journal', async () => {
            const sqlLeak = () =>
                Promise.reject(new Error('relation "accounts" does not exist: SELECT id FROM accounts'));
            await serve({}, sqlLeak);

            const response = await harness.request(
                '/auth/login',
                json('POST', { email: ADRESSE, password: MOT_DE_PASSE }),
            );
            const raw = await response.text();
            const body = JSON.parse(raw) as { type: string; detail: string };

            expect(response.status).toBe(500);
            expect(body.type).toBe('internal_error');
            expect(body.detail).toBe('The request could not be processed.');
            expect(raw).not.toMatch(/accounts|SELECT|relation|\bat \w+/i);
            expect(harness.logger.lines.some(line => line.level === 'error')).toBe(true);
        });
    });

    describe('confiance proxy et cle du limiteur de debit', () => {
        // Onze essais depassent le budget d authentification (dix). Chaque essai
        // porte l adresse transmise voulue ; le contenu de la requete importe
        // peu, seul son client compte pour le limiteur.
        function badLogins(forwardedFor: (attempt: number) => string): Promise<Response>[] {
            return Array.from({ length: 11 }, (_unused, attempt) =>
                harness.request('/auth/login', {
                    ...json('POST', { email: ADRESSE, password: 'MauvaisMotDePasse1' }),
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Forwarded-For': forwardedFor(attempt),
                    },
                }),
            );
        }

        const oneClient = (): string => '203.0.113.7';
        const oneClientEach = (attempt: number): string => `198.51.100.${String(attempt + 1)}`;

        it('limite une meme adresse transmise quand un proxy est declare', async () => {
            await serve({ trustProxy: 1 });

            const responses = await Promise.all(badLogins(oneClient));

            expect(responses.filter(response => response.status === 429)).not.toHaveLength(0);
        });

        it('ne confond pas des adresses transmises distinctes quand un proxy est declare', async () => {
            await serve({ trustProxy: 1 });

            const responses = await Promise.all(badLogins(oneClientEach));

            expect(responses.filter(response => response.status === 429)).toHaveLength(0);
        });

        it('ignore l adresse transmise et retombe sur la connexion quand aucun proxy n est declare', async () => {
            await serve({ trustProxy: 0 });

            const responses = await Promise.all(badLogins(oneClientEach));

            expect(responses.filter(response => response.status === 429)).not.toHaveLength(0);
        });
    });
});
