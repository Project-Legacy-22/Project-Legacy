import { Router } from 'express';
import type { RequestHandler } from 'express';
import { CreateItemBody, UpdateItemBody, ItemIdParams, ListItemsQuery } from '@legacy/contracts';
import type { ItemDto, ItemPageDto } from '@legacy/contracts';
import type { Item, ItemPage } from '@legacy/core-items';

import type { ItemUseCases } from '../../composition-root.js';
import { accountOf } from '../session.js';

// The response shape clients depend on. The entity carries an ownerId since
// EN-09; it is an internal fact and never crosses the HTTP boundary, so every
// response is mapped through here rather than sent raw.
function toItemDto(item: Item): ItemDto {
    return { id: item.id, name: item.name, completed: item.completed };
}

// The cursor crosses the boundary as null when no page is left: undefined is
// what the domain says, and JSON.stringify would drop the field entirely.
function toItemPageDto(page: ItemPage): ItemPageDto {
    return { items: page.items.map(toItemDto), nextCursor: page.nextCursor ?? null };
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

    const list: RequestHandler = (req, res, next) => {
        // Validated like a body: an absent limit is the default page size, an
        // unparseable or oversized one is a 400.
        const query = ListItemsQuery.safeParse(req.query);
        if (!query.success) return next(query.error);

        useCases
            .listItems(accountOf(res).id, { limit: query.data.limit, cursor: query.data.cursor })
            .then(page => res.send(toItemPageDto(page)))
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
            .changeItem(params.data.id, accountOf(res).id, body.data)
            .then(item => res.send(toItemDto(item)))
            .catch(next);
    };

    const remove: RequestHandler = (req, res, next) => {
        const params = ItemIdParams.safeParse(req.params);
        if (!params.success) return next(params.error);

        useCases
            .removeItem(params.data.id, accountOf(res).id)
            .then(() => res.sendStatus(200))
            .catch(next);
    };

    router.get('/items', list);
    router.post('/items', add);
    router.put('/items/:id', change);
    router.delete('/items/:id', remove);

    return router;
}
