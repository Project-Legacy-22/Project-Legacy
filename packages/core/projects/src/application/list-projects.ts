import type { ProjectPage, ProjectPageQuery, ProjectRepository } from '../ports/project-repository.js';

export function makeListProjects(repository: ProjectRepository) {
    return async function listProjects(memberId: string, page: ProjectPageQuery): Promise<ProjectPage> {
        return repository.findPageForMember(memberId, page);
    };
}
