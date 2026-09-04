import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import { createSupabaseIdentityProvider } from './supabase-identity-provider.js';

// A stand-in for GoTrue, served over real HTTP on a free port. The adapter is
// given its address like any other Supabase URL, so nothing in the production
// code changes to make it testable, and the exchange under test is the one that
// actually happens: a request goes out, a status and a body come back.
//
// What is pinned here is the translation, not the provider: which answers are
// ordinary and which are failures. Treating an unknown error as a rejected
// credential would turn an outage into a wall of plausible refusals, and that
// is precisely the mistake no integration suite would catch quickly.

interface Reponse {
    status: number;
    body: unknown;
}

interface FauxFournisseur {
    url: string;
    quand: (route: string, reponse: Reponse) => void;
    close: () => Promise<void>;
}

const UTILISATEUR = {
    id: '9f8e4a2c-1b3d-4e5f-8a90-1c2d3e4f5a6b',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'alice@example.test',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-09-04T10:00:00Z',
};

const SESSION = {
    access_token: 'jeton-acces',
    token_type: 'bearer',
    expires_in: 3600,
    refresh_token: 'jeton-rafraichissement',
    user: UTILISATEUR,
};

async function fauxFournisseur(): Promise<FauxFournisseur> {
    const reponses = new Map<string, Reponse>();

    const server = createServer((req, res) => {
        req.resume();
        const chemin = (req.url ?? '').split('?')[0] ?? '';
        const reponse = reponses.get(`${req.method ?? ''} ${chemin}`) ?? {
            status: 404,
            body: { code: 404, error_code: 'not_configured', msg: 'route non configuree' },
        };

        res.writeHead(reponse.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(reponse.body));
    });

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    return {
        url: `http://127.0.0.1:${String(port)}`,
        quand: (route, reponse) => reponses.set(route, reponse),
        close: () =>
            new Promise<void>((resolve, reject) => {
                server.close(error => {
                    if (error) reject(error);
                    else resolve();
                });
            }),
    };
}

const SIGNUP = 'POST /auth/v1/signup';
const TOKEN = 'POST /auth/v1/token';
const USER = 'GET /auth/v1/user';

describe('adaptateur Supabase Auth', () => {
    let faux: FauxFournisseur;

    async function adaptateur() {
        faux = await fauxFournisseur();
        return {
            provider: createSupabaseIdentityProvider({ url: faux.url, anonKey: 'cle-publique' }),
            faux,
        };
    }

    afterEach(() => faux.close());

    describe('register', () => {
        it('signale un compte cree', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(SIGNUP, { status: 200, body: SESSION });

            await expect(provider.register('alice@example.test', 'MotDePasse2026')).resolves.toBe(
                'created',
            );
        });

        it('signale une adresse deja enregistree plutot que d echouer', async () => {
            const { provider, faux: serveur } = await adaptateur();
            serveur.quand(SIGNUP, {
                status: 422,
                body: { code: 422, error_code: 'user_already_exists', msg: 'User already registered' },
            });

            await expect(provider.register('alice@example.test', 'MotDePasse2026')).resolves.toBe(
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

            await expect(provider.register('alice@example.test', 'MotDePasse2026')).rejects.toThrow(
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
});
