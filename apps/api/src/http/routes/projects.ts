import { Router } from 'express';
import type { RequestHandler } from 'express';
import { CreateProjectBody, ListProjectsQuery, ProjectIdParams, ProjectMemberIdParams } from '@legacy/contracts';
import type { ProjectDto, ProjectMemberListDto, ProjectPageDto } from '@legacy/contracts';
import type { Membership, Project, ProjectPage } from '@legacy/core-projects';

import type { ProjectUseCases } from '../../composition-root.js';
import { accountOf } from '../session.js';

function toProjectDto(project: Project): ProjectDto {
    return {
        id: project.id,
        name: project.name,
        role: project.role,
        itemCount: project.itemCount,
    };
}

function toProjectPageDto(page: ProjectPage): ProjectPageDto {
    return {
        projects: page.projects.map(toProjectDto),
        nextCursor: page.nextCursor ?? null,
    };
}

function toMemberListDto(members: readonly Membership[]): ProjectMemberListDto {
    return {
        members: members.map(member => ({
            userId: member.userId,
            email: member.email,
            role: member.role,
        })),
    };
}

function removeMember(useCases: ProjectUseCases): RequestHandler {
    return async (req, res) => {
        const { projectId, userId } = ProjectMemberIdParams.parse(req.params);
        await useCases.removeProjectMember({
            projectId,
            memberId: userId,
            callerId: accountOf(res).id,
        });
        res.status(204).end();
    };
}

export function projectsRouter(useCases: ProjectUseCases): Router {
    const router = Router();

    const list: RequestHandler = (req, res, next) => {
        const query = ListProjectsQuery.safeParse(req.query);
        if (!query.success) return next(query.error);

        useCases
            .listProjects(accountOf(res).id, {
                limit: query.data.limit,
                cursor: query.data.cursor,
            })
            .then((page) => res.send(toProjectPageDto(page)))
            .catch(next);
    };

    const add: RequestHandler = (req, res, next) => {
        const body = CreateProjectBody.safeParse(req.body);
        if (!body.success) return next(body.error);

        useCases
            .addProject(body.data.name, accountOf(res).id)
            .then((project) => res.send(toProjectDto(project)))
            .catch(next);
    };

    const remove: RequestHandler = (req, res, next) => {
        const params = ProjectIdParams.safeParse(req.params);
        if (!params.success) return next(params.error);

        useCases
            .removeProject(params.data.projectId, accountOf(res).id)
            .then(() => res.sendStatus(200))
            .catch(next);
    };

    // Who is in this project. A caller outside it is answered like a project
    // that does not exist -- the use case decides that, not this route.
    const members: RequestHandler = (req, res, next) => {
        const params = ProjectIdParams.safeParse(req.params);
        if (!params.success) return next(params.error);

        useCases
            .listProjectMembers(params.data.projectId, accountOf(res).id)
            .then((found: readonly Membership[]) => res.send(toMemberListDto(found)))
            .catch(next);
    };

    router.get('/projects', list);
    router.get('/projects/:projectId/members', members);
    router.post('/projects', add);
    router.delete('/projects/:projectId', remove);
    router.delete('/projects/:projectId/members/:userId', removeMember(useCases));

    return router;
}
