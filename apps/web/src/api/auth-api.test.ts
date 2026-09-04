import { afterEach, describe, expect, it, vi } from 'vitest';

import { authApi } from './auth-api';
import { ApiError } from './items-api';
import { labels } from '../labels';

const ACCOUNT = { id: '5b1f0f4a-9d3f-4d0e-9e2a-6c0f5a3b1d77', email: 'ada@example.com' };
const CREDENTIALS = { email: 'ada@example.com', password: 'un-mot-de-passe-valide' };

function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function stubFetch(...responses: Response[]): ReturnType<typeof vi.fn> {
    const calls = [...responses];
    const fetchMock = vi.fn(async () => calls.shift() ?? response({}, 500));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('authApi.signIn', () => {
    it('renvoie le compte du serveur', async () => {
        stubFetch(response(ACCOUNT));

        await expect(authApi.signIn(CREDENTIALS)).resolves.toEqual(ACCOUNT);
    });

    // Le critere de US-11b : le message ne doit pas permettre de distinguer une
    // adresse inconnue d un mot de passe faux. Le serveur s en garde deja ; le
    // client ne doit pas defaire ce travail en relayant un detail plus precis.
    it('remplace le detail du serveur par un message unique', async () => {
        stubFetch(
            response(
                {
                    type: 'authentication_error',
                    title: 'AuthenticationError',
                    status: 401,
                    detail: 'No account exists for this address.',
                    instance: '/auth/login',
                    traceId: 'a-test-trace-id',
                },
                401,
            ),
        );

        await expect(authApi.signIn(CREDENTIALS)).rejects.toEqual(
            new ApiError(401, labels.signInRejected),
        );
    });

    it('signale une reponse illisible plutot que de la propager', async () => {
        stubFetch(response({ id: 42 }));

        await expect(authApi.signIn(CREDENTIALS)).rejects.toMatchObject({ status: 502 });
    });

    it('n envoie le mot de passe que dans le corps de la requete', async () => {
        const fetchMock = stubFetch(response(ACCOUNT));

        await authApi.signIn(CREDENTIALS);

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/auth/login');
        expect(url).not.toContain(CREDENTIALS.password);
        expect(init.body).toContain(CREDENTIALS.password);
    });
});

describe('authApi.register', () => {
    it('aboutit sur une reponse sans corps', async () => {
        stubFetch(new Response(null, { status: 201 }));

        await expect(authApi.register(CREDENTIALS)).resolves.toBeUndefined();
    });

    it('remonte le detail du serveur quand la creation echoue', async () => {
        stubFetch(
            response(
                {
                    type: 'validation_error',
                    title: 'ValidationError',
                    status: 400,
                    detail: 'Password is too short.',
                    instance: '/auth/register',
                    traceId: 'a-test-trace-id',
                },
                400,
            ),
        );

        await expect(authApi.register(CREDENTIALS)).rejects.toEqual(
            new ApiError(400, 'Password is too short.'),
        );
    });

    it('retombe sur un message generique quand le corps n est pas exploitable', async () => {
        stubFetch(new Response('pas du json', { status: 500 }));

        await expect(authApi.register(CREDENTIALS)).rejects.toEqual(
            new ApiError(500, labels.registerFailed),
        );
    });
});

describe('authApi.currentAccount', () => {
    it('renvoie le compte quand la session est valide', async () => {
        stubFetch(response(ACCOUNT));

        await expect(authApi.currentAccount(new AbortController().signal)).resolves.toEqual(ACCOUNT);
    });

    // Arriver sans session est le cas ordinaire d une premiere visite, pas une
    // panne : le client le distingue d une erreur pour que l interface montre
    // le formulaire au lieu d un message d echec.
    it('renvoie null sans session, plutot que de lever', async () => {
        stubFetch(new Response(null, { status: 401 }));

        await expect(authApi.currentAccount(new AbortController().signal)).resolves.toBeNull();
    });

    it('leve quand le serveur echoue pour une autre raison', async () => {
        stubFetch(new Response(null, { status: 503 }));

        await expect(authApi.currentAccount(new AbortController().signal)).rejects.toEqual(
            new ApiError(503, labels.sessionCheckFailed),
        );
    });
});
