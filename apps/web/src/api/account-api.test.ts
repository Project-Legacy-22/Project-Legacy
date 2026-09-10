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
    // Le document n est pas relu ici : la page le remet tel quel a la personne,
    // et le parser pour le reserialiser sauvegarderait autre chose que ce que
    // l API a servi.
    it('rend le corps servi sans le relire', async () => {
        const served = new Blob([EXPORT_BODY], { type: 'application/json' });
        const response = new Response(null, {
            headers: { 'Content-Type': 'application/json' },
        });
        vi.spyOn(response, 'blob').mockResolvedValue(served);
        stubFetch(response);

        const document = await accountApi.exportPersonalData();

        expect(document).toBe(served);
    });

    it('reprend le detail du serveur quand l export est refuse', async () => {
        stubFetch(problem('This account no longer exists.', 404));

        await expect(accountApi.exportPersonalData()).rejects.toEqual(
            new ApiError(404, 'This account no longer exists.'),
        );
    });

    it('retombe sur son propre message quand la reponse n en porte pas', async () => {
        stubFetch(new Response('pas du json', { status: 500 }));

        await expect(accountApi.exportPersonalData()).rejects.toEqual(new ApiError(500, labels.exportFailed));
    });
});

describe('accountApi.deleteAccount', () => {
    it('envoie la confirmation dans le corps d une requete DELETE', async () => {
        const fetchMock = stubFetch(new Response(null, { status: 204 }));

        await accountApi.deleteAccount({ confirmation: ADRESSE });

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/auth/me');
        expect(init.method).toBe('DELETE');
        expect(init.body).toBe(JSON.stringify({ confirmation: ADRESSE }));
    });

    // Le refus de confirmation est le seul que la personne doit pouvoir lire mot
    // pour mot : il dit laquelle des deux adresses ne correspondait pas.
    it('reprend le detail du serveur quand la confirmation est refusee', async () => {
        stubFetch(problem('Deleting the account requires confirming its email address.', 422));

        await expect(accountApi.deleteAccount({ confirmation: ADRESSE })).rejects.toEqual(
            new ApiError(422, 'Deleting the account requires confirming its email address.'),
        );
    });

    it('retombe sur son propre message quand la reponse n en porte pas', async () => {
        stubFetch(new Response('', { status: 503 }));

        await expect(accountApi.deleteAccount({ confirmation: ADRESSE })).rejects.toEqual(
            new ApiError(503, labels.deleteAccountFailed),
        );
    });
});
