// Wording of the projects section: creation, listing, removal and renaming
// (#463). Kept apart from labels.ts, which is at its line ceiling, and spread
// into it like the other label modules.
export const projectLabels = {
    projectsKicker: 'Workspace',
    projectsTitle: 'Projects',
    projectNameLabel: 'Project name',
    projectNameRequired: 'Enter a project name.',
    createProject: 'Create project',
    creatingProject: 'Creating project…',
    loadingProjects: 'Loading projects…',
    loadMoreProjects: 'Load more projects',
    loadingMoreProjects: 'Loading more projects…',
    retryLoadingMoreProjects: 'Try loading more projects again',
    allProjectsLoaded: 'All projects loaded',
    emptyProjects: 'No project yet. Create one to start grouping items.',
    selectProject: 'Select or create a project first.',
    invalidProject: 'The server returned an invalid project.',
    invalidProjectList: 'The server returned an invalid project list.',
    loadProjectsFailed: 'Unable to load the project list.',
    loadMoreProjectsFailed: 'Unable to load more projects.',
    createProjectFailed: 'Unable to create the project.',
    removeProjectFailed: 'Unable to remove the project.',
    projectNameHelp(maximumLength: number): string {
        return `Required. ${maximumLength} characters maximum.`;
    },
    projectNameTooLong(maximumLength: number): string {
        return `Enter no more than ${maximumLength} characters.`;
    },
    projectItemCount(count: number): string {
        return `${count} ${count === 1 ? 'item' : 'items'}`;
    },
    projectsLoaded(count: number): string {
        return `${count} more ${count === 1 ? 'project' : 'projects'} loaded.`;
    },
    projectCreated(name: string): string {
        return `${name} created.`;
    },
    projectRemoved(name: string): string {
        return `${name} removed.`;
    },
    removeProject(name: string): string {
        return `Remove project: ${name}`;
    },
    confirmProjectRemoval(name: string, itemCount: number): string {
        const items = `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;
        return `Remove ${name}? ${items} will be permanently deleted, along with any previously removed items.`;
    },

    // Renaming (#463)
    rename: 'Rename',
    renameProject(name: string): string {
        return `Rename project: ${name}`;
    },
    projectRenameLabel(name: string): string {
        return `New name for ${name}`;
    },
    saveProjectName: 'Save name',
    savingProjectName: 'Saving…',
    cancelRename: 'Cancel',
    projectRenamed(previous: string, next: string): string {
        return `${previous} is now named ${next}.`;
    },
    renameProjectFailed: 'Unable to rename this project.',
} as const;
