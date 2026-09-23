import { afterEach, describe, expect, it, vi } from 'vitest';

import { labels } from '../labels';
import { ApiError, failureMessage, NO_RESPONSE, send, statusMessage } from './failure';

function problem(status: number, detail: string, headers: Record<string, string> = {}): Response {
    return new Response(
        JSON.stringify({
            type: 'some_type',
            title: 'SomeTitle',
            status,
            detail,
            instance: '/projects',
            traceId: 'trace-123',
        }),
        { status, headers: { 'Content-Type': 'application/json', ...headers } },
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('failureMessage', () => {
    it.each([400, 404, 409, 413])('shows the explanation the API gave for a %i', async (status) => {
        const message = await failureMessage(problem(status, 'This task no longer exists.'), 'Unable to save.');

        expect(message).toBe('This task no longer exists.');
    });

    // A domain 403 carries its reason, "the current password is incorrect";
    // only a bare 403 needs a sentence of ours.
    it('keeps the explanation of a 403 and falls back to a sentence of ours without one', async () => {
        await expect(failureMessage(problem(403, 'The current password is incorrect.'))).resolves.toBe(
            'The current password is incorrect.',
        );
        await expect(failureMessage(new Response(null, { status: 403 }), 'Unable to remove the member.')).resolves.toBe(
            `Unable to remove the member. ${labels.forbidden}`,
        );
    });

    it('says how long to wait after too many attempts, from Retry-After', async () => {
        const message = await failureMessage(
            problem(429, 'Too many attempts. Try again later.', { 'Retry-After': '240' }),
            'Unable to sign in.',
        );

        expect(message).toBe('Unable to sign in. Too many attempts. Try again in 4 minutes.');
    });

    it.each([502, 503, 504])('describes a %i as a passing unavailability with its delay', async (status) => {
        const message = await failureMessage(problem(status, 'upstream text', { 'Retry-After': '30' }));

        expect(message).toBe('The service is temporarily unavailable. Try again in 30 seconds.');
    });

    it('blames our side on a 500 and gives the reference to quote, never the server text', async () => {
        const message = await failureMessage(problem(500, 'The request could not be processed.'), 'Unable to load.');

        expect(message).toBe(
            'Unable to load. Something went wrong on our side. Try again; if it keeps happening, quote reference trace-123.',
        );
    });

    // A proxy in front of the API answers with its own HTML page, not a
    // problem document: the status still decides the message.
    it('reads the status alone when the body is a proxy page', async () => {
        const message = await failureMessage(new Response('<html>Bad Gateway</html>', { status: 502 }));

        expect(message).toBe(labels.serviceUnavailable(undefined));
    });

    it('ignores a Retry-After that is not a whole number of seconds', async () => {
        const message = await failureMessage(problem(503, 'x', { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' }));

        expect(message).toBe(labels.serviceUnavailable(undefined));
    });

    it('names the status when neither the API nor the caller explains it', async () => {
        await expect(failureMessage(new Response(null, { status: 418 }))).resolves.toBe(labels.requestFailed(418));
    });
});

describe('statusMessage', () => {
    // The anti-enumeration screens: whatever the server says, an address must
    // never reach the page, while a throttle is still explained.
    it('never repeats the server detail, and still explains a throttle', async () => {
        const message = await statusMessage(
            problem(429, 'Address bob@example.com already registered.', { 'Retry-After': '5' }),
            'Unable to start the email change.',
        );

        expect(message).toBe('Unable to start the email change. Too many attempts. Try again in 5 seconds.');
        expect(message).not.toContain('bob@example.com');
    });

    it('keeps its own sentence for a refusal', async () => {
        const message = await statusMessage(problem(400, 'Address bob@example.com is taken.'), 'Unable to send a reset link.');

        expect(message).toBe('Unable to send a reset link.');
    });
});

describe('send', () => {
    it('turns a request that got no answer into a failure a screen can show', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));

        await expect(send('/projects')).rejects.toEqual(new ApiError(NO_RESPONSE, labels.serverUnreachable));
    });

    // Every hook ignores an abort: turning it into an error message would put
    // "unable to reach the server" on a screen the person just left.
    it('lets an aborted request through untouched', async () => {
        const abort = new DOMException('The operation was aborted.', 'AbortError');
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(abort)));

        await expect(send('/projects')).rejects.toBe(abort);
    });

    it('returns the response of a request that was answered, whatever its status', async () => {
        const answer = new Response(null, { status: 503 });
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(answer)));

        await expect(send('/projects')).resolves.toBe(answer);
    });
});
