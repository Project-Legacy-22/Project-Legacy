import { useCallback, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { MembersApi } from '../api/members-api';
import type { ProjectDto, ProjectsApi } from '../api/projects-api';
import { failedAddresses, inviteAll } from '../invite-all';
import { labels } from '../labels';
import { projectErrorMessage } from './projects-state';
import type { AddProjectResult, ProjectFeedback, SetProjects, SetSelectedProjectId } from './projects-state';

interface ActionContext {
    api: ProjectsApi;
    members: MembersApi;
    selectedProjectId: string | null;
    setProjects: SetProjects;
    setSelectedProjectId: SetSelectedProjectId;
    setFeedback: Dispatch<SetStateAction<ProjectFeedback>>;
    setIsAdding: Dispatch<SetStateAction<boolean>>;
    setPendingProjectId: Dispatch<SetStateAction<string | null>>;
}

// Once the project exists, the people named in the form are invited (#420).
// The project is created whatever becomes of the invitations: one that fails
// is reported with its reason, and can be sent again from the members panel.
async function inviteToCreated(context: ActionContext, created: ProjectDto, invitees: readonly string[]) {
    const results = await inviteAll(context.members, created.id, invitees);
    const message = `${labels.projectCreated(created.name)} ${labels.invitationSummary(results)}`;
    context.setFeedback({ status: failedAddresses(results).length === 0 ? 'success' : 'error', message });
}

async function addProject(context: ActionContext, name: string, invitees: readonly string[]): Promise<AddProjectResult> {
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
        if (invitees.length > 0) await inviteToCreated(context, created, invitees);
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
    members: MembersApi;
    selectedProjectId: string | null;
    setProjects: SetProjects;
    setSelectedProjectId: SetSelectedProjectId;
}

export function useProjectActions(dependencies: ProjectActionDependencies) {
    const [feedback, setFeedback] = useState<ProjectFeedback>({ status: 'idle' });
    const [isAdding, setIsAdding] = useState(false);
    const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
    const context = useMemo(() => ({ ...dependencies, setFeedback, setIsAdding, setPendingProjectId }), [dependencies]);
    const add = useCallback(
        (name: string, invitees: readonly string[] = []) => addProject(context, name, invitees),
        [context],
    );
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
