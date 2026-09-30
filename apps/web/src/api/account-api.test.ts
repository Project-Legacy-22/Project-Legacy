import { afterEach, describe, expect, it, vi } from 'vitest';

import { accountApi } from './account-api';
import { ApiError } from './items-api';
import { labels } from '../labels';

const EXPORT_BODY = '{"exportedAt":"2026-09-08T12:00:00.000Z"}';
const ADRESSE = 'ada@example.com';

function problem(detail: string, status: number): Response {
    return new Response(
        JSON.stringify({
            type: 'erasure_not_confirmed',
            title: 'ErasureNotConfirmed',
            status,
            detail,
            instance: '/auth/me',
            traceId: 'a-test-trace-id',
        }),
        { status, headers: { 'Content-Type': 'application/json' } },
    );
}

function stubFetch(...responses: Response[]): ReturnType<typeof vi.fn> {
    const calls = [...responses];
    const fetchMock = vi.fn(async () => calls.shift() ?? new Response('', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('accountApi.exportPersonalData', () => {
    // The document is not read back here: the page hands it to the person as it is, and parsing it
    // to serialise it again would save something other than what the API served.
    it('returns the served body without reading it back', async () => {
        const served = new Blob([EXPORT_BODY], { type: 'application/json' });
        const response = new Response(null, {
            headers: { 'Content-Type': 'application/json' },
        });
        vi.spyOn(response, 'blob').mockResolvedValue(served);
        stubFetch(response);

        const document = await accountApi.exportPersonalData();

        expect(document).toBe(served);
    });

    it('takes the server\'s detail when the export is refused', async () => {
        stubFetch(problem('This account no longer exists.', 404));

        await expect(accountApi.exportPersonalData()).rejects.toEqual(
            new ApiError(404, 'This account no longer exists.'),
        );
    });

    it('falls back on its own message when the response carries none', async () => {
        stubFetch(new Response('pas du json', { status: 500 }));

        await expect(accountApi.exportPersonalData()).rejects.toEqual(
            new ApiError(500, `${labels.exportFailed} ${labels.serverError(undefined)}`),
        );
    });
});

describe('accountApi.deleteAccount', () => {
    it('sends the confirmation in the body of a DELETE request', async () => {
        const fetchMock = stubFetch(new Response(null, { status: 204 }));

        await accountApi.deleteAccount({ confirmation: ADRESSE });

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/auth/me');
        expect(init.method).toBe('DELETE');
        expect(init.body).toBe(JSON.stringify({ confirmation: ADRESSE }));
    });

    // The confirmation refusal is the only one the person must be able to read word for word: it
    // says which of the two addresses did not match.
    it('takes the server\'s detail when the confirmation is refused', async () => {
        stubFetch(problem('Deleting the account requires confirming its email address.', 422));

        await expect(accountApi.deleteAccount({ confirmation: ADRESSE })).rejects.toEqual(
            new ApiError(422, 'Deleting the account requires confirming its email address.'),
        );
    });

    it('falls back on its own message when the response carries none', async () => {
        stubFetch(new Response('', { status: 503 }));

        await expect(accountApi.deleteAccount({ confirmation: ADRESSE })).rejects.toEqual(
            new ApiError(503, `${labels.deleteAccountFailed} ${labels.serviceUnavailable(undefined)}`),
        );
    });
});
