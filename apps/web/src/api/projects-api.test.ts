import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from './items-api';
import { projectsApi } from './projects-api';

const PROJECT_ID = '00000000-0000-7000-8000-000000000010';

function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

afterEach(() => vi.unstubAllGlobals());

describe('projectsApi', () => {
    it('validates a project page and forwards its cursor', async () => {
        const fetchMock = vi.fn<typeof fetch>(async () => response({ projects: [], nextCursor: 'next/project' }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            projectsApi.listProjects({
                signal: new AbortController().signal,
                cursor: 'previous/project',
            }),
        ).resolves.toEqual({ projects: [], nextCursor: 'next/project' });
        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, init] = fetchMock.mock.calls[0] ?? [];
        expect(url).toBe('/projects?limit=20&cursor=previous%2Fproject');
        expect(init?.signal).toBeInstanceOf(AbortSignal);
    });

    it('rejects an invalid project returned by the server', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => response({ projects: [{ id: 42 }] })),
        );

        await expect(projectsApi.listProjects({ signal: new AbortController().signal })).rejects.toMatchObject({
            name: 'ApiError',
            status: 502,
        });
    });

    it('turns a failed deletion into a typed API error', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                response(
                    {
                        type: 'project_not_found',
                        title: 'ProjectNotFound',
                        status: 404,
                        detail: 'Project not found.',
                        instance: `/projects/${PROJECT_ID}`,
                        traceId: 'trace-id',
                    },
                    404,
                ),
            ),
        );

        await expect(projectsApi.deleteProject(PROJECT_ID)).rejects.toEqual(new ApiError(404, 'Project not found.'));
    });
});
