export const MAX_PROJECT_NAME_LENGTH = 255;

export type ProjectRole = 'owner' | 'member';

export interface Project {
    id: string;
    name: string;
    role: ProjectRole;
    itemCount: number;
}

export class ProjectError extends Error {
    constructor(
        readonly code: string,
        readonly httpStatus: number,
        message: string,
    ) {
        super(message);
        this.name = new.target.name;
    }
}

export class InvalidProjectName extends ProjectError {
    constructor(reason: string) {
        super('invalid_project_name', 400, `Project name ${reason}`);
    }
}

export class ProjectNotFound extends ProjectError {
    constructor(readonly projectId: string) {
        super('project_not_found', 404, `Project ${projectId} not found`);
    }
}

export class InvalidProjectCursor extends ProjectError {
    constructor() {
        super('invalid_project_cursor', 400, 'Project cursor was not issued by this API');
    }
}

export function projectName(candidate: string): string {
    const name = candidate.trim();

    if (name.length === 0) throw new InvalidProjectName('must not be empty');
    if (name.length > MAX_PROJECT_NAME_LENGTH) {
        throw new InvalidProjectName(`must be at most ${MAX_PROJECT_NAME_LENGTH} characters`);
    }

    return name;
}

export function createProject(id: string, name: string): Project {
    return { id, name: projectName(name), role: 'owner', itemCount: 0 };
}

export function rehydrateProject(row: Project): Project {
    return { ...row };
}
