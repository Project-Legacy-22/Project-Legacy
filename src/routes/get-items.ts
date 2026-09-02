import type { RequestHandler } from 'express';

import db from '../persistence/index.js';

const getItems: RequestHandler = async (_req, res) => {
    const items = await db.getItems();
    res.send(items);
};

export default getItems;
