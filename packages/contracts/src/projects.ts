import { z } from 'zod';

export const MAX_PROJECT_NAME_LENGTH = 255;
export const DEFAULT_PROJECT_PAGE_SIZE = 20;
export const MAX_PROJECT_PAGE_SIZE = 100;

const CURSOR_MAX_LENGTH = 256;
const projectName = z.string().trim().min(1).max(MAX_PROJECT_NAME_LENGTH);
const pageSize = z.coerce.number().int().min(1).max(MAX_PROJECT_PAGE_SIZE);

export const ProjectIdParams = z.object({
    projectId: z.uuid(),
});

export const ProjectItemIdParams = ProjectIdParams.extend({
    id: z.uuid(),
});

export const CreateProjectBody = z.object({
    name: projectName,
});

export const ListProjectsQuery = z.object({
    limit: pageSize.default(DEFAULT_PROJECT_PAGE_SIZE),
    cursor: z.string().min(1).max(CURSOR_MAX_LENGTH).optional(),
});

export const ProjectRole = z.enum(['owner', 'member']);

export const ProjectDto = z.object({
    id: z.uuid(),
    name: z.string(),
    role: ProjectRole,
    itemCount: z.number().int().nonnegative(),
});

export const ProjectPageDto = z.object({
    projects: z.array(ProjectDto),
    nextCursor: z.string().nullable(),
});

export type ProjectIdParams = z.infer<typeof ProjectIdParams>;
export type ProjectItemIdParams = z.infer<typeof ProjectItemIdParams>;
export type CreateProjectBody = z.infer<typeof CreateProjectBody>;
export type ListProjectsQuery = z.infer<typeof ListProjectsQuery>;
export type ProjectRole = z.infer<typeof ProjectRole>;
export type ProjectDto = z.infer<typeof ProjectDto>;
export type ProjectPageDto = z.infer<typeof ProjectPageDto>;
