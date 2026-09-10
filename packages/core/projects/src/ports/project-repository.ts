import type { Project } from '../domain/project.js';

export interface ProjectPageQuery {
    limit: number;
    cursor: string | undefined;
}

export interface ProjectPage {
    projects: Project[];
    nextCursor: string | undefined;
}

export interface ProjectRepository {
    findPageForMember(memberId: string, page: ProjectPageQuery): Promise<ProjectPage>;
    saveForOwner(project: Project, ownerId: string): Promise<void>;
    removeForOwner(projectId: string, ownerId: string): Promise<boolean>;
}
