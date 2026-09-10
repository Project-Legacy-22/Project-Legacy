import type { Dispatch, SetStateAction } from 'react';

import { ApiError } from '../api/items-api';
import type { ProjectDto } from '../api/projects-api';
import type { ActionResult, Feedback, LoadState, PaginationState } from './view-state.js';

export type ProjectsLoadState = LoadState;
export type ProjectsPaginationState = PaginationState;
export type ProjectFeedback = Feedback;
export type AddProjectResult = ActionResult;
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
