import { useCallback, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { ProjectDto, ProjectsApi } from '../api/projects-api';
import { labels } from '../labels';
import { projectErrorMessage } from './projects-state';
import type { AddProjectResult, ProjectFeedback, SetProjects, SetSelectedProjectId } from './projects-state';

interface ActionContext {
    api: ProjectsApi;
    selectedProjectId: string | null;
    setProjects: SetProjects;
    setSelectedProjectId: SetSelectedProjectId;
    setFeedback: Dispatch<SetStateAction<ProjectFeedback>>;
    setIsAdding: Dispatch<SetStateAction<boolean>>;
    setPendingProjectId: Dispatch<SetStateAction<string | null>>;
}

async function addProject(context: ActionContext, name: string): Promise<AddProjectResult> {
    context.setIsAdding(true);
    context.setFeedback({ status: 'idle' });
    try {
        const created = await context.api.createProject({ name });
        context.setProjects((current) => [created, ...current]);
        context.setSelectedProjectId(created.id);
        context.setFeedback({
            status: 'success',
            message: labels.projectCreated(created.name),
        });
        return { status: 'success' };
    } catch (error) {
        return {
            status: 'error',
            message: projectErrorMessage(error, labels.createProjectFailed),
        };
    } finally {
        context.setIsAdding(false);
    }
}

async function removeProject(context: ActionContext, project: ProjectDto): Promise<boolean> {
    context.setPendingProjectId(project.id);
    context.setFeedback({ status: 'idle' });
    try {
        await context.api.deleteProject(project.id);
        context.setProjects((current) => {
            const remaining = current.filter((candidate) => candidate.id !== project.id);
            context.setSelectedProjectId((selected) =>
                selected === project.id ? (remaining[0]?.id ?? null) : selected,
            );
            return remaining;
        });
        context.setFeedback({
            status: 'success',
            message: labels.projectRemoved(project.name),
        });
        return true;
    } catch (error) {
        context.setFeedback({
            status: 'error',
            message: projectErrorMessage(error, labels.removeProjectFailed),
        });
        return false;
    } finally {
        context.setPendingProjectId(null);
    }
}

interface ProjectActionDependencies {
    api: ProjectsApi;
    selectedProjectId: string | null;
    setProjects: SetProjects;
    setSelectedProjectId: SetSelectedProjectId;
}

export function useProjectActions(dependencies: ProjectActionDependencies) {
    const [feedback, setFeedback] = useState<ProjectFeedback>({ status: 'idle' });
    const [isAdding, setIsAdding] = useState(false);
    const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
    const context = useMemo(() => ({ ...dependencies, setFeedback, setIsAdding, setPendingProjectId }), [dependencies]);
    const add = useCallback((name: string) => addProject(context, name), [context]);
    const remove = useCallback((project: ProjectDto) => removeProject(context, project), [context]);
    const adjustItemCount = useCallback(
        (change: number) => {
            dependencies.setProjects((current) =>
                current.map((project) =>
                    project.id === dependencies.selectedProjectId
                        ? { ...project, itemCount: Math.max(0, project.itemCount + change) }
                        : project,
                ),
            );
        },
        [dependencies],
    );

    return { feedback, isAdding, pendingProjectId, add, remove, adjustItemCount };
}
