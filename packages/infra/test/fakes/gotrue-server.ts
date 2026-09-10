import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

// A stand-in for GoTrue, served over real HTTP on a free port. The adapter is
// given its address like any other Supabase URL, so nothing in the production
// code changes to make it testable, and the exchange under test is the one that
// actually happens: a request goes out, a status and a body come back.
//
// What the suites built on it pin is the translation, not the provider: which
// answers are ordinary and which are failures. Treating an unknown error as a
// rejected credential would turn an outage into a wall of plausible refusals,
// and that is precisely the mistake no integration suite would catch quickly.

export interface Reponse {
    status: number;
    body: unknown;
}

export interface FauxFournisseur {
    url: string;
    quand: (route: string, reponse: Reponse) => void;
    close: () => Promise<void>;
}

export const UTILISATEUR = {
    id: '9f8e4a2c-1b3d-4e5f-8a90-1c2d3e4f5a6b',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'alice@example.test',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-09-04T10:00:00Z',
};

export const SESSION = {
    access_token: 'jeton-acces',
    token_type: 'bearer',
    expires_in: 3600,
    refresh_token: 'jeton-rafraichissement',
    user: UTILISATEUR,
};

// Les routes de GoTrue que l adaptateur appelle. Le serveur ignore la chaine de
// requete, donc les deux echanges de /token -- mot de passe et rafraichissement
// -- passent par la meme cle.
export const SIGNUP = 'POST /auth/v1/signup';
export const TOKEN = 'POST /auth/v1/token';
export const USER = 'GET /auth/v1/user';
export const ADMIN_DELETE = `DELETE /auth/v1/admin/users/${UTILISATEUR.id}`;
export const RECOVER = 'POST /auth/v1/recover';
export const VERIFY = 'POST /auth/v1/verify';
export const UPDATE_USER = 'PUT /auth/v1/user';
export const LOGOUT = 'POST /auth/v1/logout';

export async function fauxFournisseur(): Promise<FauxFournisseur> {
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
