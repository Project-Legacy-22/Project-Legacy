import type { RequestHandler } from 'express';
import { v4 as uuid } from 'uuid';

import db from '../persistence/index.js';
import type { NewItem } from '../persistence/types.js';

// The body is not validated yet: it is typed as unknown fields and narrowed by
// hand, so a missing `name` still stores and echoes back `undefined` exactly as
// before. Rejecting it with a 400 is validation at the boundary, which is a
// later step of #5 and would change the observable behaviour here.
type AddItemHandler = RequestHandler<Record<string, never>, unknown, Record<string, unknown>>;

const addItem: AddItemHandler = async (req, res) => {
    const item: NewItem = {
        id: uuid(),
        name: typeof req.body.name === 'string' ? req.body.name : undefined,
        completed: false,
    };

    await db.storeItem(item);
    res.send(item);
};

export default addItem;
