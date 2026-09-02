import type { RequestHandler } from 'express';

import db from '../persistence/index.js';

// Same as add-item: the body is narrowed, not validated. `completed` is passed
// on untouched because the persistence layer stores it through the same
// truthiness test the original code used.
type UpdateItemHandler = RequestHandler<{ id: string }, unknown, Record<string, unknown>>;

const updateItem: UpdateItemHandler = async (req, res) => {
    const { id } = req.params;

    await db.updateItem(id, {
        name: typeof req.body.name === 'string' ? req.body.name : undefined,
        completed: req.body.completed,
    });

    const item = await db.getItem(id);
    res.send(item);
};

export default updateItem;
