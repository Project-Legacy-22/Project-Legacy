import type { Dispatch, SetStateAction } from 'react';

import { ApiError } from '../api/items-api';
import type { ProjectDto } from '../api/projects-api';

export type ProjectsLoadState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string };

export type ProjectsPaginationState =
    { status: 'idle'; announcement: string } | { status: 'loading' } | { status: 'error'; message: string };

export type ProjectFeedback =
    { status: 'idle' } | { status: 'success'; message: string } | { status: 'error'; message: string };

export type AddProjectResult = { status: 'success' } | { status: 'error'; message: string };
export type SetProjects = Dispatch<SetStateAction<readonly ProjectDto[]>>;
export type SetSelectedProjectId = Dispatch<SetStateAction<string | null>>;

export function projectErrorMessage(error: unknown, fallback: string): string {
    return error instanceof ApiError ? error.message : fallback;
}

export function appendUniqueProjects(
    current: readonly ProjectDto[],
    nextPage: readonly ProjectDto[],
): readonly ProjectDto[] {
    const ids = new Set(current.map((project) => project.id));
    return [...current, ...nextPage.filter((project) => !ids.has(project.id))];
}
