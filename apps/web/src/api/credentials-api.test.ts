import { afterEach, describe, expect, it, vi } from 'vitest';

import { credentialsApi } from './credentials-api';
import { ApiError } from './items-api';
import { labels } from '../labels';

function response(body: unknown, status = 200): Response {
    return new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function problem(status: number, detail: string): Response {
    return response({ type: 'x', title: 'X', status, detail, instance: '/x', traceId: 't' }, status);
}

function stubFetch(...responses: Response[]) {
    const calls = [...responses];
    const fetchMock = vi.fn((_input: string, _init?: RequestInit) =>
        Promise.resolve(calls.shift() ?? response({}, 500)),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

function sent(fetchMock: ReturnType<typeof stubFetch>): { url: string; body: unknown } {
    const [url, init] = fetchMock.mock.calls[0] ?? ['', undefined];
    const body = init?.body;
    return { url, body: typeof body === 'string' ? JSON.parse(body) : undefined };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('credentialsApi.changePassword', () => {
    it('envoie les deux mots de passe dans le corps, jamais l URL', async () => {
        const fetchMock = stubFetch(response(null, 204));

        await credentialsApi.changePassword({
            currentPassword: 'AncienMotDePasse1',
            newPassword: 'NouveauMotDePasse2',
        });

        const { url, body } = sent(fetchMock);
        expect(url).toBe('/auth/me/password');
        expect(url).not.toContain('AncienMotDePasse1');
        expect(body).toEqual({
            currentPassword: 'AncienMotDePasse1',
            newPassword: 'NouveauMotDePasse2',
        });
    });

    // Le detail du serveur est utile ici : il porte sur ce que la personne
    // vient de taper.
    it('remonte le detail du serveur', async () => {
        stubFetch(problem(403, 'The current password is incorrect.'));

        await expect(
            credentialsApi.changePassword({ currentPassword: 'x', newPassword: 'y'.repeat(12) }),
        ).rejects.toEqual(new ApiError(403, 'The current password is incorrect.'));
    });
});

describe('credentialsApi.changeEmail', () => {
    it('envoie la nouvelle adresse dans le corps', async () => {
        const fetchMock = stubFetch(response(null, 202));

        await credentialsApi.changeEmail({ newEmail: 'neuf@example.com' });

        const { url, body } = sent(fetchMock);
        expect(url).toBe('/auth/me/email');
        expect(url).not.toContain('neuf@example.com');
        expect(body).toEqual({ newEmail: 'neuf@example.com' });
    });

    // Le critere central : le formulaire ne doit pas devenir un oracle. Meme si
    // le serveur envoyait un detail, le client le remplace par un message fixe.
    it('ne remonte jamais le detail du serveur', async () => {
        stubFetch(problem(429, 'Address bob@example.com already registered.'));

        await expect(credentialsApi.changeEmail({ newEmail: 'bob@example.com' })).rejects.toEqual(
            new ApiError(429, labels.emailChangeFailed),
        );
    });
});

describe('credentialsApi.confirmEmailChange', () => {
    it('envoie le jeton dans le corps, jamais l URL', async () => {
        const fetchMock = stubFetch(response(null, 204));

        await credentialsApi.confirmEmailChange({ token: 'jeton-de-confirmation' });

        const { url, body } = sent(fetchMock);
        expect(url).toBe('/auth/me/email/confirm');
        expect(url).not.toContain('jeton-de-confirmation');
        expect(body).toEqual({ token: 'jeton-de-confirmation' });
    });

    it('remonte le detail du serveur sur un lien invalide', async () => {
        stubFetch(problem(400, 'This confirmation link is invalid or has expired.'));

        await expect(credentialsApi.confirmEmailChange({ token: 'perime' })).rejects.toEqual(
            new ApiError(400, 'This confirmation link is invalid or has expired.'),
        );
    });
});
