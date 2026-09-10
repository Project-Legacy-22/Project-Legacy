import { DEFAULT_PROJECT_PAGE_SIZE, ProjectDto, ProjectPageDto } from '@legacy/contracts';
import type { CreateProjectBody } from '@legacy/contracts';

import { ApiError, errorMessage, jsonHeaders, requestJson } from './items-api';
import { labels } from '../labels';

export type { ProjectDto, ProjectPageDto } from '@legacy/contracts';

export interface ListProjectsRequest {
    signal: AbortSignal;
    cursor?: string;
}

export interface ProjectsApi {
    listProjects: (request: ListProjectsRequest) => Promise<ProjectPageDto>;
    createProject: (body: CreateProjectBody) => Promise<ProjectDto>;
    deleteProject: (projectId: string) => Promise<void>;
}

function projectsPath(cursor?: string): string {
    const query = new URLSearchParams({
        limit: String(DEFAULT_PROJECT_PAGE_SIZE),
    });
    if (cursor !== undefined) query.set('cursor', cursor);
    return `/projects?${query.toString()}`;
}

export const projectsApi: ProjectsApi = {
    listProjects({ signal, cursor }) {
        return requestJson(projectsPath(cursor), { headers: { Accept: 'application/json' }, signal }, (value) => {
            const result = ProjectPageDto.safeParse(value);
            if (!result.success) throw new ApiError(502, labels.invalidProjectList);
            return result.data;
        });
    },

    createProject(body) {
        return requestJson(
            '/projects',
            { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) },
            (value) => {
                const result = ProjectDto.safeParse(value);
                if (!result.success) throw new ApiError(502, labels.invalidProject);
                return result.data;
            },
        );
    },

    async deleteProject(projectId) {
        const response = await fetch(`/projects/${encodeURIComponent(projectId)}`, {
            method: 'DELETE',
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new ApiError(response.status, await errorMessage(response));
    },
};
