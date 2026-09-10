import { createProject } from '../domain/project.js';
import type { Project } from '../domain/project.js';
import type { ProjectRepository } from '../ports/project-repository.js';

export interface AddProjectDependencies {
    repository: ProjectRepository;
    newId: () => string;
}

export function makeAddProject({ repository, newId }: AddProjectDependencies) {
    return async function addProject(name: string, ownerId: string): Promise<Project> {
        const project = createProject(newId(), name);
        await repository.saveForOwner(project, ownerId);
        return project;
    };
}
