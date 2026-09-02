import type { RequestHandler } from 'express';

import db from '../persistence/index.js';

const deleteItem: RequestHandler<{ id: string }> = async (req, res) => {
    await db.removeItem(req.params.id);
    res.sendStatus(200);
};

export default deleteItem;
