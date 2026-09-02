import express from 'express';
import type { Express } from 'express';
import type { Logger } from '@legacy/infra';

import type { Config } from '../config.js';
import type { ItemUseCases } from '../composition-root.js';
import { itemsRouter } from './routes/items.js';
import { translateErrors } from './error-middleware.js';
import { withTraceId } from './trace.js';
import { logRequests } from './request-log.js';

export function createServer(config: Config, useCases: ItemUseCases, logger: Logger): Express {
    const app = express();

    app.use(express.json());
    app.use(withTraceId);
    app.use(logRequests(logger));
    app.use(express.static(config.staticDir));

    app.use(itemsRouter(useCases));

    // Registered last: express only treats a middleware as an error handler
    // once every route has had its chance to fail.
    app.use(translateErrors(logger));

    return app;
}
