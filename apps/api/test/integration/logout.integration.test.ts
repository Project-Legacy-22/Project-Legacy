import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { integrationConfig, realApplication, serveAs } from './support.js';
import type { Harness } from '../http-harness.js';

// Every other suite covering sign-out (sign-out.test.ts,
// supabase-identity-provider-sign-out.test.ts, auth-logout.test.ts) exercises
// the application's own logic against a fake identity provider. None of them
// can prove GoTrue itself refuses to renew a signed-out session afterwards --
// that needs the real provider, reached the way a browser eventually would:
// by trying to exchange the refresh token our own domain deliberately never
// holds (see Session in packages/core/auth/src/ports/identity-provider.ts).
const MOT_DE_PASSE = 'IntegrationTest2026';

describe('POST /auth/logout (integration)', () => {
    let app: Awaited<ReturnType<typeof realApplication>>;
    let harness: Harness;

    beforeAll(async () => {
        app = realApplication();
        await app.start();
        harness = await serveAs(app);
    });

    afterAll(async () => {
        await harness.close();
        await app.stop();
    });

    // One linear scenario rather than a separate "it still works before
    // logout" case sharing the same token: local refresh-token rotation
    // (supabase/config.toml) invalidates a refresh token the moment it is
    // exchanged, so using it once to prove it works would leave nothing
    // left to prove revoked.
    it('rend le jeton de rafraichissement inutilisable', async () => {
        const email = `integration-logout-${randomUUID()}@example.com`;
        await app.useCases.auth.registerAccount(email, MOT_DE_PASSE);

        // A client of its own, never through our composed app: this is the
        // only place a refresh token is ever read, precisely because our
        // domain's Session type does not carry one.
        const config = integrationConfig();
        const raw = createClient(config.supabaseUrl, config.supabaseAnonKey);
        const signedIn = await raw.auth.signInWithPassword({ email, password: MOT_DE_PASSE });
        if (signedIn.error !== null || signedIn.data.session === null) {
            throw new Error('setup: could not sign in against the real provider', {
                cause: signedIn.error,
            });
        }
        const { access_token: accessToken, refresh_token: refreshToken } = signedIn.data.session;

        const deconnexion = await harness.request('/auth/logout', {
            method: 'POST',
            headers: { Cookie: `session=${accessToken}` },
        });
        expect(deconnexion.status).toBe(204);

        const echange = await raw.auth.refreshSession({ refresh_token: refreshToken });

        expect(echange.error).not.toBeNull();
        expect(echange.data.session).toBeNull();
    });
});
