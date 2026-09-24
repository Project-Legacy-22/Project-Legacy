import { Router } from 'express';
import type { RequestHandler } from 'express';
import { InvitationIdParams, InviteMemberBody, ProjectIdParams } from '@legacy/contracts';
import type { InvitationOutcomeDto, PendingInvitationListDto } from '@legacy/contracts';
import type { PendingInvitation } from '@legacy/core-projects';

import type { ProjectUseCases } from '../../composition-root.js';
import { rateLimit } from '../rate-limit.js';
import { accountOf } from '../session.js';

// Inviting into a project, and answering (#401). Under /projects because it is
// a read over projects and that prefix is already routed to the API by
// vercel.json and the development proxy; mounted before the project routes so
// that /projects/invitations is not read as a project identifier.

// Inviting answers « no account carries that address » when none does, so the
// owner can correct a typo. That makes the route an account-existence oracle,
// and this budget is what bounds it. Keyed on the account, not the address the
// request came from: the caller is authenticated, and one account cannot widen
// its budget by changing network. Twenty in fifteen minutes is more than an
// owner filling a team needs.
const INVITATIONS_PER_WINDOW = 20;
const INVITATION_WINDOW_MS = 15 * 60 * 1000;

function toPendingListDto(invitations: readonly PendingInvitation[]): PendingInvitationListDto {
    return {
        invitations: invitations.map(invitation => ({
            id: invitation.id,
            projectId: invitation.projectId,
            projectName: invitation.projectName,
            invitedByEmail: invitation.invitedByEmail,
            createdAt: invitation.createdAt,
        })),
    };
}

function invite(useCases: ProjectUseCases): RequestHandler {
    return (req, res, next) => {
        const params = ProjectIdParams.safeParse(req.params);
        if (!params.success) return next(params.error);
        const body = InviteMemberBody.safeParse(req.body);
        if (!body.success) return next(body.error);

        useCases
            .inviteProjectMember({ projectId: params.data.projectId, actorId: accountOf(res).id, email: body.data.email })
            .then(outcome => {
                const dto: InvitationOutcomeDto = { outcome };
                res.status(outcome === 'invited' ? 201 : 200).send(dto);
            })
            .catch(next);
    };
}

function list(useCases: ProjectUseCases): RequestHandler {
    return (_req, res, next) => {
        useCases
            .listInvitations(accountOf(res).id)
            .then(invitations => res.send(toPendingListDto(invitations)))
            .catch(next);
    };
}

function respond(useCases: ProjectUseCases, accept: boolean): RequestHandler {
    return (req, res, next) => {
        const params = InvitationIdParams.safeParse(req.params);
        if (!params.success) return next(params.error);

        useCases
            .respondToInvitation({ invitationId: params.data.invitationId, inviteeId: accountOf(res).id, accept })
            .then(() => res.status(204).end())
            .catch(next);
    };
}

export function invitationsRouter(useCases: ProjectUseCases): Router {
    const router = Router();
    const budget = rateLimit({
        maxAttempts: INVITATIONS_PER_WINDOW,
        windowMs: INVITATION_WINDOW_MS,
        // The session guard runs before this router and places the account on
        // the response; `req.res` is set by Express before any handler runs.
        key: req => (req.res === undefined ? (req.ip ?? 'unknown') : accountOf(req.res).id),
    });

    router.get('/projects/invitations', list(useCases));
    router.post('/projects/invitations/:invitationId/accept', respond(useCases, true));
    router.post('/projects/invitations/:invitationId/decline', respond(useCases, false));
    router.post('/projects/:projectId/invitations', budget, invite(useCases));

    return router;
}
