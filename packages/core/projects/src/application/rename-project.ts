import { ProjectNotFound, projectName } from '../domain/project.js';
import type { Project } from '../domain/project.js';
import type { ProjectRepository } from '../ports/project-repository.js';

export interface ProjectRenaming {
    projectId: string;
    ownerId: string;
    name: string;
}

export function makeRenameProject(repository: ProjectRepository) {
    // A member and an outsider both get ProjectNotFound, as for a removal: a
    // distinct refusal would confirm the project exists to whoever guesses ids.
    return async function renameProject({ projectId, ownerId, name }: ProjectRenaming): Promise<Project> {
        const renamed = await repository.renameForOwner(projectId, ownerId, projectName(name));
        if (renamed === undefined) throw new ProjectNotFound(projectId);
        return renamed;
    };
}
