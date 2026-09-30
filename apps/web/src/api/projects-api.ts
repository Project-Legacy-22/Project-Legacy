import { DEFAULT_PROJECT_PAGE_SIZE, ProjectDto, ProjectPageDto } from '@legacy/contracts';
import type { CreateProjectBody, RenameProjectBody } from '@legacy/contracts';

import { ApiError, errorMessage, jsonHeaders, requestJson } from './items-api';
import { labels } from '../labels';
import { send } from './failure';

export type { ProjectDto, ProjectPageDto } from '@legacy/contracts';

export interface ListProjectsRequest {
    signal: AbortSignal;
    cursor?: string;
}

export interface ProjectsApi {
    listProjects: (request: ListProjectsRequest) => Promise<ProjectPageDto>;
    createProject: (body: CreateProjectBody) => Promise<ProjectDto>;
    deleteProject: (projectId: string) => Promise<void>;
    renameProject: (projectId: string, body: RenameProjectBody) => Promise<ProjectDto>;
}

function projectsPath(cursor?: string): string {
    const query = new URLSearchParams({
        limit: String(DEFAULT_PROJECT_PAGE_SIZE),
    });
    if (cursor !== undefined) query.set('cursor', cursor);
    return `/projects?${query.toString()}`;
}

function parseProject(value: unknown): ProjectDto {
    const result = ProjectDto.safeParse(value);
    if (!result.success) throw new ApiError(502, labels.invalidProject);
    return result.data;
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
            parseProject,
        );
    },

    renameProject(projectId, body) {
        return requestJson(
            `/projects/${encodeURIComponent(projectId)}`,
            { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(body) },
            parseProject,
        );
    },

    async deleteProject(projectId) {
        const response = await send(`/projects/${encodeURIComponent(projectId)}`, {
            method: 'DELETE',
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new ApiError(response.status, await errorMessage(response));
    },
};
