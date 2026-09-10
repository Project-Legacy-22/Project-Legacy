import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

import { PRIVACY_POLICY_VERSION } from '@legacy/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { integrationConfig, realApplication, serveAs } from './support.js';
import type { Harness } from '../http-harness.js';

// The unit, adapter and HTTP suites for US-36 all run against a fake identity
// provider. None can prove GoTrue itself stops honouring the other sessions
// after a signed-in password change while keeping the one that asked -- that
// needs the real provider, reached the way a browser eventually would: by
// trying to exchange a refresh token our own domain deliberately never holds
// (see Session in packages/core/auth/src/ports/identity-provider.ts).
const ANCIEN = 'IntegrationChange2026';
const NOUVEAU = 'IntegrationChanged2027';

describe('PUT /auth/me/password (integration)', () => {
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

    it('revoque les autres sessions, garde la courante, et pose le nouveau mot de passe', async () => {
        const email = `integration-credentials-${randomUUID()}@example.com`;
        await app.useCases.auth.registerAccount(email, ANCIEN, PRIVACY_POLICY_VERSION);

        // Raw clients of their own: this is the only place a refresh token is
        // read, precisely because our domain's Session type does not carry one.
        const config = integrationConfig();
        const raw = () => createClient(config.supabaseUrl, config.supabaseAnonKey);

        const courante = await raw().auth.signInWithPassword({ email, password: ANCIEN });
        const autre = await raw().auth.signInWithPassword({ email, password: ANCIEN });
        if (
            courante.error !== null ||
            courante.data.session === null ||
            autre.error !== null ||
            autre.data.session === null
        ) {
            throw new Error('setup: could not open two sessions', { cause: courante.error });
        }

        const changement = await harness.request('/auth/me/password', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Cookie: `session=${courante.data.session.access_token}; refresh=${courante.data.session.refresh_token}`,
            },
            body: JSON.stringify({ currentPassword: ANCIEN, newPassword: NOUVEAU }),
        });
        expect(changement.status).toBe(204);

        // The other session can no longer renew.
        const autreEchange = await raw().auth.refreshSession({
            refresh_token: autre.data.session.refresh_token,
        });
        expect(autreEchange.error).not.toBeNull();
        expect(autreEchange.data.session).toBeNull();

        // The session that asked for the change can still renew.
        const courantEchange = await raw().auth.refreshSession({
            refresh_token: courante.data.session.refresh_token,
        });
        expect(courantEchange.error).toBeNull();
        expect(courantEchange.data.session).not.toBeNull();

        // The new password works; the old one does not.
        const avecNouveau = await raw().auth.signInWithPassword({ email, password: NOUVEAU });
        const avecAncien = await raw().auth.signInWithPassword({ email, password: ANCIEN });
        expect(avecNouveau.error).toBeNull();
        expect(avecAncien.error).not.toBeNull();
    });

    it('rejette un mot de passe actuel faux', async () => {
        const email = `integration-credentials-${randomUUID()}@example.com`;
        await app.useCases.auth.registerAccount(email, ANCIEN, PRIVACY_POLICY_VERSION);

        const config = integrationConfig();
        const signedIn = await createClient(config.supabaseUrl, config.supabaseAnonKey)
            .auth.signInWithPassword({ email, password: ANCIEN });
        if (signedIn.error !== null || signedIn.data.session === null) {
            throw new Error('setup: could not sign in', { cause: signedIn.error });
        }

        const reponse = await harness.request('/auth/me/password', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Cookie: `session=${signedIn.data.session.access_token}; refresh=${signedIn.data.session.refresh_token}`,
            },
            body: JSON.stringify({ currentPassword: 'PasLeBon2026', newPassword: NOUVEAU }),
        });

        expect(reponse.status).toBe(403);
    });
});
