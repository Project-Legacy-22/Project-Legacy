import { afterEach, describe, expect, it, vi } from 'vitest';

import { attentionApi } from './attention-api';
import { ApiError } from './items-api';
import { anAttention } from '../test/builders/attention-builder';

function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('attentionApi.listAttention', () => {
    it('demande les groupes pour le jour du navigateur et les renvoie', async () => {
        const fetchMock = vi.fn<typeof fetch>(async () => response(anAttention({ workload: 'all_done' })));
        vi.stubGlobal('fetch', fetchMock);

        const attention = await attentionApi.listAttention('2026-09-23', new AbortController().signal);

        expect(attention.workload).toBe('all_done');
        expect(fetchMock).toHaveBeenCalledWith('/projects/attention?today=2026-09-23', expect.anything());
    });

    it('signale une reponse qui ne respecte pas le contrat', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => response({ workload: 'busy' })));

        await expect(
            attentionApi.listAttention('2026-09-23', new AbortController().signal),
        ).rejects.toMatchObject({ status: 502 });
    });

    it('leve quand le serveur refuse', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })));

        await expect(
            attentionApi.listAttention('2026-09-23', new AbortController().signal),
        ).rejects.toBeInstanceOf(ApiError);
    });
});
