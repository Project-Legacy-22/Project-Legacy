import { ProjectNotFound } from '../domain/project.js';
import type { ProjectRepository } from '../ports/project-repository.js';

export function makeRemoveProject(repository: ProjectRepository) {
    return async function removeProject(projectId: string, ownerId: string): Promise<void> {
        if (!(await repository.removeForOwner(projectId, ownerId))) {
            throw new ProjectNotFound(projectId);
        }
    };
}
