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
    it('sends both passwords in the body, never the URL', async () => {
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

    // The server's detail is useful here: it is about what the person just typed.
    it('raises the server\'s detail', async () => {
        stubFetch(problem(403, 'The current password is incorrect.'));

        await expect(
            credentialsApi.changePassword({ currentPassword: 'x', newPassword: 'y'.repeat(12) }),
        ).rejects.toEqual(new ApiError(403, 'The current password is incorrect.'));
    });
});

describe('credentialsApi.changeEmail', () => {
    it('sends the new address in the body', async () => {
        const fetchMock = stubFetch(response(null, 202));

        await credentialsApi.changeEmail({ newEmail: 'neuf@example.com' });

        const { url, body } = sent(fetchMock);
        expect(url).toBe('/auth/me/email');
        expect(url).not.toContain('neuf@example.com');
        expect(body).toEqual({ newEmail: 'neuf@example.com' });
    });

    // The central criterion: the form must not become an oracle. Even if the server sent a detail,
    // the client replaces it with a fixed message.
    it('never raises the server\'s detail', async () => {
        stubFetch(problem(429, 'Address bob@example.com already registered.'));

        await expect(credentialsApi.changeEmail({ newEmail: 'bob@example.com' })).rejects.toEqual(
            new ApiError(429, `${labels.emailChangeFailed} ${labels.tooManyRequests(undefined)}`),
        );
    });
});

describe('credentialsApi.confirmEmailChange', () => {
    it('sends the token in the body, never the URL', async () => {
        const fetchMock = stubFetch(response(null, 204));

        await credentialsApi.confirmEmailChange({ token: 'jeton-de-confirmation' });

        const { url, body } = sent(fetchMock);
        expect(url).toBe('/auth/me/email/confirm');
        expect(url).not.toContain('jeton-de-confirmation');
        expect(body).toEqual({ token: 'jeton-de-confirmation' });
    });

    it('raises the server\'s detail on an invalid link', async () => {
        stubFetch(problem(400, 'This confirmation link is invalid or has expired.'));

        await expect(credentialsApi.confirmEmailChange({ token: 'perime' })).rejects.toEqual(
            new ApiError(400, 'This confirmation link is invalid or has expired.'),
        );
    });
});
