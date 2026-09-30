import { afterEach, describe, expect, it, vi } from 'vitest';

import { authApi } from './auth-api';
import { ApiError } from './items-api';
import { PRIVACY_POLICY_VERSION } from '@legacy/contracts';

import { labels } from '../labels';

const ACCOUNT = { id: '5b1f0f4a-9d3f-4d0e-9e2a-6c0f5a3b1d77', email: 'ada@example.com' };
const REGISTRATION = {
    email: 'ada@example.com',
    password: 'un-mot-de-passe-valide',
    acceptsPrivacyPolicy: true as const,
    policyVersion: PRIVACY_POLICY_VERSION,
} as const;

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
    it('returns the server\'s account', async () => {
        stubFetch(response(ACCOUNT));

        await expect(authApi.signIn(CREDENTIALS)).resolves.toEqual(ACCOUNT);
    });

    // The US-11b criterion: the message must not tell an unknown address from a wrong password. The
    // server already guards against it; the client must not undo that work by passing on a more
    // precise detail.
    it('replaces the server\'s detail with a single message', async () => {
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

    // Measured on the deployment: GoTrue answered Gateway Timeout, the API returned 500, and the
    // screen said "check the address and the password". Both were right. A refusal and an outage
    // are not the same answer.
    it('tells a server outage from a credentials refusal', async () => {
        stubFetch(
            response(
                {
                    type: 'internal_error',
                    title: 'InternalError',
                    status: 500,
                    detail: 'The request could not be processed.',
                    instance: '/auth/login',
                    traceId: 'a-test-trace-id',
                },
                500,
            ),
        );

        await expect(authApi.signIn(CREDENTIALS)).rejects.toEqual(
            new ApiError(500, `${labels.signInFailed} ${labels.serverError('a-test-trace-id')}`),
        );
    });

    it('reports an unreadable response rather than propagating it', async () => {
        stubFetch(response({ id: 42 }));

        await expect(authApi.signIn(CREDENTIALS)).rejects.toMatchObject({ status: 502 });
    });

    it('sends the password only in the request body', async () => {
        const fetchMock = stubFetch(response(ACCOUNT));

        await authApi.signIn(CREDENTIALS);

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/auth/login');
        expect(url).not.toContain(CREDENTIALS.password);
        expect(init.body).toContain(CREDENTIALS.password);
    });
});

describe('authApi.register', () => {
    it('succeeds on a response without a body', async () => {
        stubFetch(new Response(null, { status: 201 }));

        await expect(authApi.register(REGISTRATION)).resolves.toBeUndefined();
    });

    it('raises the server\'s detail when the creation fails', async () => {
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

        await expect(authApi.register(REGISTRATION)).rejects.toEqual(
            new ApiError(400, 'Password is too short.'),
        );
    });

    it('falls back on a generic message when the body is not usable', async () => {
        stubFetch(new Response('pas du json', { status: 500 }));

        await expect(authApi.register(REGISTRATION)).rejects.toEqual(
            new ApiError(500, `${labels.registerFailed} ${labels.serverError(undefined)}`),
        );
    });
});

describe('authApi.requestPasswordReset', () => {
    it('succeeds on an accepted response without a body', async () => {
        stubFetch(new Response(null, { status: 202 }));

        await expect(authApi.requestPasswordReset({ email: 'ada@example.com' })).resolves.toBeUndefined();
    });

    // The US-28 criterion: the response must not reveal whether the address has an account. The
    // client therefore never passes on the server's detail here.
    it('throws a generic message, never the server\'s detail', async () => {
        stubFetch(
            response(
                {
                    type: 'rate_limited',
                    title: 'TooManyAttempts',
                    status: 429,
                    detail: 'Address alice@example.com already has a pending link.',
                    instance: '/auth/password/forgot',
                    traceId: 'a-test-trace-id',
                },
                429,
            ),
        );

        await expect(authApi.requestPasswordReset({ email: 'ada@example.com' })).rejects.toEqual(
            new ApiError(429, `${labels.resetRequestFailed} ${labels.tooManyRequests(undefined)}`),
        );
    });

    it('sends the address only in the body', async () => {
        const fetchMock = stubFetch(new Response(null, { status: 202 }));

        await authApi.requestPasswordReset({ email: 'ada@example.com' });

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/auth/password/forgot');
        expect(url).not.toContain('ada@example.com');
        expect(init.body).toContain('ada@example.com');
    });
});

describe('authApi.resetPassword', () => {
    const BODY = { token: 'un-jeton-de-recuperation', password: 'NouveauMotDePasse2' };

    it('succeeds on a response without a body', async () => {
        stubFetch(new Response(null, { status: 204 }));

        await expect(authApi.resetPassword(BODY)).resolves.toBeUndefined();
    });

    // Here the detail is useful: "this link has expired" is exactly what the person on the reset
    // screen needs to read.
    it('raises the server\'s detail when the link is invalid', async () => {
        stubFetch(
            response(
                {
                    type: 'invalid_reset_token',
                    title: 'InvalidResetToken',
                    status: 400,
                    detail: 'This password reset link is invalid or has expired. Request a new one.',
                    instance: '/auth/password/reset',
                    traceId: 'a-test-trace-id',
                },
                400,
            ),
        );

        await expect(authApi.resetPassword(BODY)).rejects.toEqual(
            new ApiError(400, 'This password reset link is invalid or has expired. Request a new one.'),
        );
    });

    it('falls back on a generic message when the body is not usable', async () => {
        stubFetch(new Response('pas du json', { status: 500 }));

        await expect(authApi.resetPassword(BODY)).rejects.toEqual(
            new ApiError(500, `${labels.resetPasswordFailed} ${labels.serverError(undefined)}`),
        );
    });

    it('sends neither the token nor the password in the URL', async () => {
        const fetchMock = stubFetch(new Response(null, { status: 204 }));

        await authApi.resetPassword(BODY);

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/auth/password/reset');
        expect(url).not.toContain(BODY.token);
        expect(url).not.toContain(BODY.password);
        expect(init.body).toContain(BODY.token);
        expect(init.body).toContain(BODY.password);
    });
});

describe('authApi.signOut', () => {
    it('succeeds on a response without a body', async () => {
        stubFetch(new Response(null, { status: 204 }));

        await expect(authApi.signOut()).resolves.toBeUndefined();
    });

    it('throws when the server refuses the request', async () => {
        stubFetch(new Response(null, { status: 500 }));

        await expect(authApi.signOut()).rejects.toEqual(new ApiError(500, labels.signOutFailed));
    });

    it('posts to /auth/logout', async () => {
        const fetchMock = stubFetch(new Response(null, { status: 204 }));

        await authApi.signOut();

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/auth/logout');
        expect(init.method).toBe('POST');
    });
});

describe('authApi.currentAccount', () => {
    it('returns the account when the session is valid', async () => {
        stubFetch(response(ACCOUNT));

        await expect(authApi.currentAccount(new AbortController().signal)).resolves.toEqual(ACCOUNT);
    });

    // Arriving without a session is the ordinary case of a first visit, not an outage: the client
    // tells it from an error so that the interface shows the form instead of a failure message.
    it('returns null without a session, rather than throwing', async () => {
        stubFetch(new Response(null, { status: 401 }));

        await expect(authApi.currentAccount(new AbortController().signal)).resolves.toBeNull();
    });

    it('throws when the server fails for another reason', async () => {
        stubFetch(new Response(null, { status: 503 }));

        await expect(authApi.currentAccount(new AbortController().signal)).rejects.toEqual(
            new ApiError(503, `${labels.sessionCheckFailed} ${labels.serviceUnavailable(undefined)}`),
        );
    });
});
