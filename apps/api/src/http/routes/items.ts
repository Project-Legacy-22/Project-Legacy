import { Router } from 'express';
import type { RequestHandler } from 'express';

import type { ItemUseCases } from '../../composition-root.js';

// Routes translate HTTP into use-case calls and back. They hold no rule of
// their own and never reach the database. Every rejected promise is forwarded
// to next(), so a failure becomes a response instead of a hanging request.
//
// The body is declared as unknown fields and narrowed by hand here; a schema at
// the boundary replaces this in the next step. `completed` keeps the original
// truthiness test so a nominal request behaves exactly as before.
type Body = Record<string, unknown>;
type ItemParams = { id: string };

export function itemsRouter(useCases: ItemUseCases): Router {
    const router = Router();

    const list: RequestHandler = (_req, res, next) => {
        useCases
            .listItems()
            .then(items => res.send(items))
            .catch(next);
    };

    const add: RequestHandler<Record<string, never>, unknown, Body> = (req, res, next) => {
        const { name } = req.body;

        useCases
            .addItem(typeof name === 'string' ? name : '')
            .then(item => res.send(item))
            .catch(next);
    };

    const change: RequestHandler<ItemParams, unknown, Body> = (req, res, next) => {
        const { name, completed } = req.body;

        useCases
            .changeItem(req.params.id, {
                name: typeof name === 'string' ? name : '',
                completed: Boolean(completed),
            })
            .then(item => res.send(item))
            .catch(next);
    };

    const remove: RequestHandler<ItemParams> = (req, res, next) => {
        useCases
            .removeItem(req.params.id)
            .then(() => res.sendStatus(200))
            .catch(next);
    };

    router.get('/items', list);
    router.post('/items', add);
    router.put('/items/:id', change);
    router.delete('/items/:id', remove);

    return router;
}
