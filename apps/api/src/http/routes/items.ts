import { Router } from 'express';
import type { RequestHandler } from 'express';
import { CreateItemBody, UpdateItemBody, ItemIdParams } from '@legacy/contracts';
import type { ItemDto } from '@legacy/contracts';
import type { Item } from '@legacy/core-items';

import type { ItemUseCases } from '../../composition-root.js';
import { accountOf } from '../session.js';

// The response shape clients depend on. The entity carries an ownerId since
// EN-09; it is an internal fact and never crosses the HTTP boundary, so every
// response is mapped through here rather than sent raw.
function toItemDto(item: Item): ItemDto {
    return { id: item.id, name: item.name, completed: item.completed };
}

// Routes translate HTTP into use-case calls and back. They hold no rule of
// their own and never reach the database.
//
// Nothing reaches a use case before a schema has vouched for it: an invalid
// body or a malformed id is handed to next(), which the error middleware turns
// into a 400. The domain still enforces its own invariants -- a rule that only
// lives at the boundary is a rule the domain cannot guarantee.
//
// Every route here is mounted behind requireAccount, so accountOf always has an
// identity to return. Reads are still not owner-scoped: filtering the list by
// owner, and answering 404 rather than 403 on someone else's item, is US-12.
export function itemsRouter(useCases: ItemUseCases): Router {
    const router = Router();

    const list: RequestHandler = (_req, res, next) => {
        useCases
            .listItems()
            .then(items => res.send(items.map(toItemDto)))
            .catch(next);
    };

    const add: RequestHandler = (req, res, next) => {
        const body = CreateItemBody.safeParse(req.body);
        if (!body.success) return next(body.error);

        useCases
            .addItem(body.data.name, accountOf(res).id)
            .then(item => res.send(toItemDto(item)))
            .catch(next);
    };

    const change: RequestHandler = (req, res, next) => {
        const params = ItemIdParams.safeParse(req.params);
        if (!params.success) return next(params.error);

        const body = UpdateItemBody.safeParse(req.body);
        if (!body.success) return next(body.error);

        useCases
            .changeItem(params.data.id, body.data)
            .then(item => res.send(toItemDto(item)))
            .catch(next);
    };

    const remove: RequestHandler = (req, res, next) => {
        const params = ItemIdParams.safeParse(req.params);
        if (!params.success) return next(params.error);

        useCases
            .removeItem(params.data.id)
            .then(() => res.sendStatus(200))
            .catch(next);
    };

    router.get('/items', list);
    router.post('/items', add);
    router.put('/items/:id', change);
    router.delete('/items/:id', remove);

    return router;
}
