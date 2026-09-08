import { InvalidProjectCursor } from '../../src/index.js';
import type { Project, ProjectRepository } from '../../src/index.js';

export interface ProjectMembership {
    projectId: string;
    userId: string;
    role: 'owner' | 'member';
}

export interface InMemoryProjectRepository extends ProjectRepository {
    projects: Map<string, Project>;
    memberships: ProjectMembership[];
}

export function inMemoryProjectRepository(
    seed: Project[] = [],
    memberships: ProjectMembership[] = [],
): InMemoryProjectRepository {
    const projects = new Map(seed.map((project) => [project.id, project]));
    const storedMemberships = [...memberships];

    return {
        projects,
        memberships: storedMemberships,
        findPageForMember(memberId, { limit, cursor }) {
            const visible = [...projects.values()]
                .filter((project) =>
                    storedMemberships.some(
                        (membership) => membership.projectId === project.id && membership.userId === memberId,
                    ),
                )
                .reverse();
            const from = cursor === undefined ? 0 : visible.findIndex((project) => project.id === cursor) + 1;

            if (cursor !== undefined && from === 0) {
                return Promise.reject(new InvalidProjectCursor());
            }

            const page = visible.slice(from, from + limit);
            const last = page.at(-1);
            return Promise.resolve({
                projects: page.map((project) => ({
                    ...project,
                    role:
                        storedMemberships.find(
                            (membership) => membership.projectId === project.id && membership.userId === memberId,
                        )?.role ?? project.role,
                })),
                nextCursor: from + limit < visible.length && last !== undefined ? last.id : undefined,
            });
        },
        saveForOwner(project, ownerId) {
            projects.set(project.id, project);
            storedMemberships.push({
                projectId: project.id,
                userId: ownerId,
                role: 'owner',
            });
            return Promise.resolve();
        },
        removeForOwner(projectId, ownerId) {
            const owns = storedMemberships.some(
                (membership) =>
                    membership.projectId === projectId && membership.userId === ownerId && membership.role === 'owner',
            );
            if (!owns) return Promise.resolve(false);
            projects.delete(projectId);
            return Promise.resolve(true);
        },
    };
}
