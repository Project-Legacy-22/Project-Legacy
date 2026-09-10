import type { ProjectDto } from '../api/projects-api';
import type {
    AddProjectResult,
    ProjectFeedback,
    ProjectsLoadState,
    ProjectsPaginationState,
} from '../hooks/use-projects';
import { labels } from '../labels';
import { ProjectForm } from './project-form';

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
    onAdd: (name: string) => Promise<AddProjectResult>;
    onRemove: (project: ProjectDto) => Promise<boolean>;
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

function ProjectList(props: ProjectsSectionProps) {
    const remove = async (project: ProjectDto) => {
        if (!globalThis.confirm(labels.confirmProjectRemoval(project.name, project.itemCount))) {
            return;
        }
        const focusTarget = focusAfterRemoval(project.id);
        if (await props.onRemove(project)) globalThis.setTimeout(() => focusTarget?.focus(), 0);
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
                        <button
                            className="button button-danger project-remove"
                            type="button"
                            aria-label={labels.removeProject(project.name)}
                            disabled={props.pendingProjectId === project.id}
                            onClick={() => void remove(project)}
                        >
                            {labels.remove}
                        </button>
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

function ProjectsContent(props: ProjectsSectionProps) {
    if (props.loadState.status === 'loading') {
        return (
            <p className="status-message" role="status">
                {labels.loadingProjects}
            </p>
        );
    }
    if (props.loadState.status === 'error') {
        return (
            <div className="error-message" role="alert">
                <p>{props.loadState.message}</p>
                <button className="button button-secondary" type="button" onClick={props.onRetry}>
                    {labels.retry}
                </button>
            </div>
        );
    }

    return (
        <>
            <ProjectForm isAdding={props.isAdding} onAdd={props.onAdd} />
            {props.projects.length === 0 ? (
                <p className="empty-message">{labels.emptyProjects}</p>
            ) : (
                <ProjectList {...props} />
            )}
            <ProjectsPagination {...props} />
        </>
    );
}

export function ProjectsSection(props: ProjectsSectionProps) {
    return (
        <section className="panel projects-panel" aria-labelledby="projects-heading">
            <div className="section-heading">
                <p className="section-kicker">{labels.projectsKicker}</p>
                <h2 id="projects-heading">{labels.projectsTitle}</h2>
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
