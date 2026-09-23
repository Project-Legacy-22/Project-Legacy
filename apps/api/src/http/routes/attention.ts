import { Router } from 'express';
import type { RequestHandler } from 'express';
import { AttentionQuery } from '@legacy/contracts';
import type { AttentionDto, AttentionGroupDto } from '@legacy/contracts';
import type { Attention, AttentionGroup } from '@legacy/core-items';

import type { AttentionUseCases } from '../../composition-root.js';
import { accountOf } from '../session.js';
import { toItemDto } from './items.js';

function toGroupDto(group: AttentionGroup): AttentionGroupDto {
    return {
        items: group.entries.map((entry) => ({ ...toItemDto(entry.item), projectName: entry.projectName })),
        hasMore: group.hasMore,
    };
}

function toAttentionDto(attention: Attention): AttentionDto {
    return {
        overdue: toGroupDto(attention.overdue),
        dueSoon: toGroupDto(attention.dueSoon),
        highPriority: toGroupDto(attention.highPriority),
        workload: attention.workload,
    };
}

function listAttention(useCases: AttentionUseCases): RequestHandler {
    return (req, res, next) => {
        const query = AttentionQuery.safeParse(req.query);
        if (!query.success) return next(query.error);

        useCases
            .listAttention(accountOf(res).id, query.data.today)
            .then((attention) => res.send(toAttentionDto(attention)))
            .catch(next);
    };
}

// The home screen's read (US-20): what needs attention across every project
// the caller belongs to. Under /projects because it is a read over them, and
// because that prefix is already routed to the API by vercel.json and the
// development proxy. No route here takes a project id: there is none named,
// the caller's memberships are the scope.
export function attentionRouter(useCases: AttentionUseCases): Router {
    const router = Router();

    router.get('/projects/attention', listAttention(useCases));

    return router;
}
