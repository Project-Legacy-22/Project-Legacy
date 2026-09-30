import { describe, expect, it, vi } from 'vitest';

import { ApiError } from './items-api';
import { guardSession } from './guard-session';

const COMPTE = { id: '5b1f0f4a-9d3f-4d0e-9e2a-6c0f5a3b1d77', email: 'ada@example.com' };

function clientQuiEchoue(error: Error) {
    return { lire: () => Promise.reject(error) };
}

describe('guardSession', () => {
    it('reports the end of the session on a 401 refusal', async () => {
        const expire = vi.fn();
        const client = guardSession(clientQuiEchoue(new ApiError(401, 'expiree')), expire);

        await expect(client.lire()).rejects.toBeInstanceOf(ApiError);

        expect(expire).toHaveBeenCalledOnce();
    });

    // A server outage is not an ended session. Confusing the two would send the person back to the
    // sign-in screen for a one-second unavailability, making them lose what they were doing.
    it('reports nothing on another error', async () => {
        const expire = vi.fn();
        const client = guardSession(clientQuiEchoue(new ApiError(500, 'panne')), expire);

        await expect(client.lire()).rejects.toBeInstanceOf(ApiError);

        expect(expire).not.toHaveBeenCalled();
    });

    it('reports nothing on a cancelled request', async () => {
        const expire = vi.fn();
        const abandon = new DOMException('abandon', 'AbortError');
        const client = guardSession(clientQuiEchoue(abandon), expire);

        await expect(client.lire()).rejects.toBe(abandon);

        expect(expire).not.toHaveBeenCalled();
    });

    // The caller keeps its error: it knows what to say about it on the screen it occupies, and the
    // end of the session is not the only thing to report.
    it('lets the error reach the caller', async () => {
        const client = guardSession(clientQuiEchoue(new ApiError(401, 'expiree')), vi.fn());

        await expect(client.lire()).rejects.toThrow('expiree');
    });

    it('returns the result of a successful call, unchanged', async () => {
        const client = guardSession({ lire: () => Promise.resolve(COMPTE) }, vi.fn());

        await expect(client.lire()).resolves.toEqual(COMPTE);
    });

    it('passes the call arguments on', async () => {
        const lire = vi.fn(async (id: string) => id);
        const client = guardSession({ lire }, vi.fn());

        await client.lire('un-identifiant');

        expect(lire).toHaveBeenCalledWith('un-identifiant');
    });
});
