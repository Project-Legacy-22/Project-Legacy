import { useMemo } from 'react';

import type { ProjectsApi } from '../api/projects-api';
import { useProjectActions } from './use-project-actions';
import { useProjectsQuery } from './use-projects-query';

export type { AddProjectResult, ProjectFeedback, ProjectsLoadState, ProjectsPaginationState } from './projects-state';

export function useProjects(api: ProjectsApi) {
    const query = useProjectsQuery(api);
    const dependencies = useMemo(
        () => ({
            api,
            selectedProjectId: query.selectedProjectId,
            setProjects: query.setProjects,
            setSelectedProjectId: query.setSelectedProjectId,
        }),
        [api, query.selectedProjectId, query.setProjects, query.setSelectedProjectId],
    );
    const actions = useProjectActions(dependencies);

    return {
        projects: query.projects,
        selectedProjectId: query.selectedProjectId,
        selectedProject: query.projects.find((project) => project.id === query.selectedProjectId) ?? null,
        loadState: query.loadState,
        feedback: actions.feedback,
        isAdding: actions.isAdding,
        pendingProjectId: actions.pendingProjectId,
        hasNextPage: query.hasNextPage,
        paginationState: query.paginationState,
        selectProject: query.setSelectedProjectId,
        addProject: actions.add,
        removeProject: actions.remove,
        adjustSelectedItemCount: actions.adjustItemCount,
        loadMore: query.loadMore,
        retry: query.retry,
    };
}
