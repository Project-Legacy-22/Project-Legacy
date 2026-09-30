import { useState } from 'react';

import type { ProjectDto } from '../api/projects-api';
import type {
    AddProjectResult,
    ProjectFeedback,
    ProjectsLoadState,
    ProjectsPaginationState,
} from '../hooks/use-projects';
import { labels } from '../labels';
import { ProjectForm } from './project-form';
import { ProjectRenameForm, renameFormId } from './project-rename-form';
import { ViewState } from './view-state';

export interface ProjectsSectionProps {
    projects: readonly ProjectDto[];
    selectedProjectId: string | null;
    loadState: ProjectsLoadState;
    feedback: ProjectFeedback;
    isAdding: boolean;
    pendingProjectId: string | null;
    hasNextPage: boolean;
    paginationState: ProjectsPaginationState;
    onSelect: (projectId: string) => void;
    // The addresses of the form's invitation field, possibly none (#420).
    onAdd: (name: string, invitees: readonly string[]) => Promise<AddProjectResult>;
    onRemove: (project: ProjectDto) => Promise<boolean>;
    onRename: (project: ProjectDto, name: string) => Promise<AddProjectResult>;
    onLoadMore: () => void;
    onRetry: () => void;
}

function focusAfterRemoval(projectId: string): HTMLElement | null {
    const row = document.querySelector(`[data-project-id="${projectId}"]`);
    return (
        row?.nextElementSibling?.querySelector<HTMLButtonElement>('.project-select') ??
        row?.previousElementSibling?.querySelector<HTMLButtonElement>('.project-select') ??
        document.querySelector<HTMLInputElement>('#project-name')
    );
}

interface OwnerActionsProps {
    project: ProjectDto;
    props: ProjectsSectionProps;
    isRenaming: boolean;
    onToggleRename: () => void;
}

function OwnerActions({ project, props, isRenaming, onToggleRename }: OwnerActionsProps) {
    const remove = async () => {
        if (!globalThis.confirm(labels.confirmProjectRemoval(project.name, project.itemCount))) {
            return;
        }
        const focusTarget = focusAfterRemoval(project.id);
        if (await props.onRemove(project)) globalThis.setTimeout(() => focusTarget?.focus(), 0);
    };

    return (
        <>
            <button
                className="button button-secondary project-rename"
                type="button"
                aria-label={labels.renameProject(project.name)}
                aria-expanded={isRenaming}
                aria-controls={isRenaming ? renameFormId(project.id) : undefined}
                onClick={onToggleRename}
            >
                {labels.rename}
            </button>
            <button
                className="button button-danger project-remove"
                type="button"
                aria-label={labels.removeProject(project.name)}
                disabled={props.pendingProjectId === project.id}
                onClick={() => void remove()}
            >
                {labels.remove}
            </button>
        </>
    );
}

// Closing the form, renamed or not, gives the focus back to the button that
// opened it: the row stays, only its name may have changed.
function focusRenameButton(projectId: string): void {
    globalThis.setTimeout(() => {
        document.querySelector<HTMLButtonElement>(`[data-project-id="${projectId}"] .project-rename`)?.focus();
    }, 0);
}

function ProjectList(props: ProjectsSectionProps) {
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const closeRename = (projectId: string) => {
        setRenamingId(null);
        focusRenameButton(projectId);
    };

    return (
        <ul id="projects-list" className="projects-list">
            {props.projects.map((project) => (
                <li key={project.id} data-project-id={project.id} className="project-row">
                    <button
                        className="project-select"
                        type="button"
                        aria-pressed={project.id === props.selectedProjectId}
                        onClick={() => props.onSelect(project.id)}
                    >
                        <span className="project-name">{project.name}</span>
                        <span className="project-count">{labels.projectItemCount(project.itemCount)}</span>
                    </button>
                    {project.role === 'owner' && (
                        <OwnerActions
                            project={project}
                            props={props}
                            isRenaming={renamingId === project.id}
                            onToggleRename={() => setRenamingId(renamingId === project.id ? null : project.id)}
                        />
                    )}
                    {renamingId === project.id && (
                        <ProjectRenameForm
                            project={project}
                            isPending={props.pendingProjectId === project.id}
                            onRename={props.onRename}
                            onClose={() => closeRename(project.id)}
                        />
                    )}
                </li>
            ))}
        </ul>
    );
}

function paginationLabel(props: ProjectsSectionProps): string {
    if (props.paginationState.status === 'loading') return labels.loadingMoreProjects;
    if (!props.hasNextPage) return labels.allProjectsLoaded;
    return props.paginationState.status === 'error' ? labels.retryLoadingMoreProjects : labels.loadMoreProjects;
}

function ProjectsPagination(props: ProjectsSectionProps) {
    const loadedPage = props.paginationState.status === 'idle' && props.paginationState.announcement !== '';
    const showButton = props.hasNextPage || loadedPage || props.paginationState.status !== 'idle';
    const unavailable = props.paginationState.status === 'loading' || !props.hasNextPage;

    return (
        <>
            {props.paginationState.status === 'error' && (
                <p id="projects-pagination-error" className="pagination-error" role="alert">
                    {props.paginationState.message}
                </p>
            )}
            {showButton && (
                <button
                    className="button button-secondary project-pagination"
                    type="button"
                    aria-controls="projects-list"
                    aria-describedby={
                        props.paginationState.status === 'error' ? 'projects-pagination-error' : undefined
                    }
                    aria-disabled={unavailable}
                    onClick={unavailable ? undefined : props.onLoadMore}
                >
                    {paginationLabel(props)}
                </button>
            )}
            <p className="visually-hidden" aria-live="polite" aria-atomic="true">
                {props.paginationState.status === 'idle' ? props.paginationState.announcement : ''}
            </p>
        </>
    );
}

function focusProjectName(): void {
    document.querySelector<HTMLInputElement>('#project-name')?.focus();
}

// The form stays outside the state: somebody whose list failed to load can
// still create a project, and the form was previously removed along with the
// list on every load and every failure.
function ProjectsContent(props: ProjectsSectionProps) {
    return (
        <>
            <ProjectForm isAdding={props.isAdding} onAdd={props.onAdd} />
            <ViewState
                state={props.loadState}
                loadingMessage={labels.loadingProjects}
                empty={{
                    isEmpty: props.projects.length === 0,
                    message: labels.emptyProjects,
                    action: { label: labels.createProject, onAction: focusProjectName },
                }}
                onRetry={props.onRetry}
            >
                <ProjectList {...props} />
            </ViewState>
            <ProjectsPagination {...props} />
        </>
    );
}

export function ProjectsSection(props: ProjectsSectionProps) {
    return (
        <section
            className="panel projects-panel"
            aria-labelledby="projects-heading"
            aria-busy={props.loadState.status === 'loading'}
        >
            <div className="section-heading">
                <p className="section-kicker">{labels.projectsKicker}</p>
                <h2 id="projects-heading" tabIndex={-1}>{labels.projectsTitle}</h2>
            </div>
            <ProjectsContent {...props} />
            {props.feedback.status !== 'idle' && (
                <p
                    className={props.feedback.status === 'error' ? 'action-error' : 'action-success'}
                    role={props.feedback.status === 'error' ? 'alert' : 'status'}
                >
                    {props.feedback.message}
                </p>
            )}
        </section>
    );
}
