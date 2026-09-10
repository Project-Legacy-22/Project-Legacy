import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { ProjectDto, ProjectsApi } from '../api/projects-api';
import { labels } from '../labels';
import { appendUniqueProjects, projectErrorMessage } from './projects-state';
import type { ProjectsLoadState, ProjectsPaginationState, SetProjects } from './projects-state';

interface NextPageContext {
    api: ProjectsApi;
    cursor: string;
    controller: AbortController;
    activeController: MutableRefObject<AbortController | null>;
    setProjects: SetProjects;
    setNextCursor: Dispatch<SetStateAction<string | null>>;
    setPaginationState: Dispatch<SetStateAction<ProjectsPaginationState>>;
}

async function loadNextPage(context: NextPageContext): Promise<void> {
    try {
        const page = await context.api.listProjects({
            signal: context.controller.signal,
            cursor: context.cursor,
        });
        if (context.controller.signal.aborted) return;
        context.setProjects((current) => appendUniqueProjects(current, page.projects));
        context.setNextCursor(page.nextCursor);
        context.setPaginationState({
            status: 'idle',
            announcement: labels.projectsLoaded(page.projects.length),
        });
    } catch (error) {
        if (context.controller.signal.aborted) return;
        context.setPaginationState({
            status: 'error',
            message: projectErrorMessage(error, labels.loadMoreProjectsFailed),
        });
    } finally {
        if (context.activeController.current === context.controller) {
            context.activeController.current = null;
        }
    }
}

function useProjectPagination(api: ProjectsApi, setProjects: SetProjects) {
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [state, setState] = useState<ProjectsPaginationState>({
        status: 'idle',
        announcement: '',
    });
    const activeController = useRef<AbortController | null>(null);
    useEffect(() => () => activeController.current?.abort(), []);

    const loadMore = useCallback(() => {
        if (nextCursor === null || activeController.current !== null) return;
        const controller = new AbortController();
        activeController.current = controller;
        setState({ status: 'loading' });
        void loadNextPage({
            api,
            cursor: nextCursor,
            controller,
            activeController,
            setProjects,
            setNextCursor,
            setPaginationState: setState,
        });
    }, [api, nextCursor, setProjects]);

    const reset = useCallback(() => {
        activeController.current?.abort();
        activeController.current = null;
        setNextCursor(null);
        setState({ status: 'idle', announcement: '' });
    }, []);

    return {
        setNextCursor,
        hasNextPage: nextCursor !== null,
        state,
        loadMore,
        reset,
    };
}

interface InitialPageContext {
    api: ProjectsApi;
    controller: AbortController;
    setProjects: SetProjects;
    setSelectedProjectId: Dispatch<SetStateAction<string | null>>;
    setLoadState: Dispatch<SetStateAction<ProjectsLoadState>>;
    setNextCursor: Dispatch<SetStateAction<string | null>>;
}

async function loadInitialPage(context: InitialPageContext): Promise<void> {
    try {
        const page = await context.api.listProjects({
            signal: context.controller.signal,
        });
        if (context.controller.signal.aborted) return;
        context.setProjects(page.projects);
        context.setNextCursor(page.nextCursor);
        context.setSelectedProjectId((current) =>
            page.projects.some((project) => project.id === current) ? current : (page.projects[0]?.id ?? null),
        );
        context.setLoadState({ status: 'ready' });
    } catch (error) {
        if (context.controller.signal.aborted) return;
        context.setLoadState({
            status: 'error',
            message: projectErrorMessage(error, labels.loadProjectsFailed),
        });
    }
}

export function useProjectsQuery(api: ProjectsApi) {
    const [projects, setProjects] = useState<readonly ProjectDto[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [loadState, setLoadState] = useState<ProjectsLoadState>({
        status: 'loading',
    });
    const [attempt, setAttempt] = useState(0);
    const pagination = useProjectPagination(api, setProjects);

    useEffect(() => {
        const controller = new AbortController();
        setLoadState({ status: 'loading' });
        pagination.reset();
        void loadInitialPage({
            api,
            controller,
            setProjects,
            setSelectedProjectId,
            setLoadState,
            setNextCursor: pagination.setNextCursor,
        });
        return () => controller.abort();
    }, [api, attempt, pagination.reset, pagination.setNextCursor]);

    return {
        projects,
        setProjects,
        selectedProjectId,
        setSelectedProjectId,
        loadState,
        hasNextPage: pagination.hasNextPage,
        paginationState: pagination.state,
        loadMore: pagination.loadMore,
        retry: () => setAttempt((current) => current + 1),
    };
}
