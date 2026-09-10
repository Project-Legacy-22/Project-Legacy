import { Router } from 'express';
import type { RequestHandler } from 'express';
import {
    CreateItemBody,
    UpdateItemBody,
    MoveItemBody,
    ProjectIdParams,
    ProjectItemIdParams,
    ListItemsQuery,
} from '@legacy/contracts';
import type { ItemDto, ItemPageDto } from '@legacy/contracts';
import type { Item, ItemPage } from '@legacy/core-items';

import type { ItemUseCases } from '../../composition-root.js';
import { accountOf } from '../session.js';

// The response shape clients depend on. The entity carries an ownerId since
// EN-09; it is an internal fact and never crosses the HTTP boundary, so every
// response is mapped through here rather than sent raw.
function toItemDto(item: Item): ItemDto {
    return {
        id: item.id,
        projectId: item.projectId,
        name: item.name,
        status: item.status,
        version: item.version,
    };
}

// The cursor crosses the boundary as null when no page is left: undefined is
// what the domain says, and JSON.stringify would drop the field entirely.
function toItemPageDto(page: ItemPage): ItemPageDto {
    return {
        items: page.items.map(toItemDto),
        nextCursor: page.nextCursor ?? null,
    };
}

function listItems(useCases: ItemUseCases): RequestHandler {
    return (req, res, next) => {
        const query = ListItemsQuery.safeParse(req.query);
        if (!query.success) return next(query.error);
        const params = ProjectIdParams.safeParse(req.params);
        if (!params.success) return next(params.error);

        useCases
            .listItems(params.data.projectId, accountOf(res).id, {
                limit: query.data.limit,
                cursor: query.data.cursor,
            })
            .then((page) => res.send(toItemPageDto(page)))
            .catch(next);
    };
}

function moveItem(useCases: ItemUseCases): RequestHandler {
    return (req, res, next) => {
        const params = ProjectItemIdParams.safeParse(req.params);
        if (!params.success) return next(params.error);

        const body = MoveItemBody.safeParse(req.body);
        if (!body.success) return next(body.error);

        useCases
            .moveItem({
                id: params.data.id,
                projectId: params.data.projectId,
                memberId: accountOf(res).id,
                status: body.data.status,
                expectedVersion: body.data.version,
            })
            .then((item) => res.send(toItemDto(item)))
            .catch(next);
    };
}

// Routes translate HTTP into use-case calls and back. They hold no rule of
// their own and never reach the database.
//
// Nothing reaches a use case before a schema has vouched for it: an invalid
// body or a malformed id is handed to next(), which the error middleware turns
// into a 400. The domain still enforces its own invariants -- a rule that only
// lives at the boundary is a rule the domain cannot guarantee.
//
// Every route is mounted behind requireAccount and names that account when it
// reaches a use case: since US-12 no read crosses owners, and a request aimed at
// somebody else's item is answered like one aimed at nothing.
export function itemsRouter(useCases: ItemUseCases): Router {
    const router = Router();

    const add: RequestHandler = (req, res, next) => {
        const body = CreateItemBody.safeParse(req.body);
        if (!body.success) return next(body.error);
        const params = ProjectIdParams.safeParse(req.params);
        if (!params.success) return next(params.error);

        useCases
            .addItem(body.data.name, params.data.projectId, accountOf(res).id)
            .then((item) => res.send(toItemDto(item)))
            .catch(next);
    };

    const change: RequestHandler = (req, res, next) => {
        const params = ProjectItemIdParams.safeParse(req.params);
        if (!params.success) return next(params.error);

        const body = UpdateItemBody.safeParse(req.body);
        if (!body.success) return next(body.error);

        useCases
            .changeItem({
                id: params.data.id,
                projectId: params.data.projectId,
                memberId: accountOf(res).id,
                changes: body.data,
            })
            .then((item) => res.send(toItemDto(item)))
            .catch(next);
    };

    const remove: RequestHandler = (req, res, next) => {
        const params = ProjectItemIdParams.safeParse(req.params);
        if (!params.success) return next(params.error);

        useCases
            .removeItem(params.data.id, params.data.projectId, accountOf(res).id)
            .then(() => res.status(204).end())
            .catch(next);
    };

    router.get('/projects/:projectId/items', listItems(useCases));
    router.post('/projects/:projectId/items', add);
    router.put('/projects/:projectId/items/:id', change);
    router.patch('/projects/:projectId/items/:id/status', moveItem(useCases));
    router.delete('/projects/:projectId/items/:id', remove);

    return router;
}
