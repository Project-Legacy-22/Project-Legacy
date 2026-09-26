import { Router } from 'express';
import type { HealthResponseDto } from '@legacy/contracts';

export interface HealthProbes {
    database: () => Promise<void>;
    broker: () => Promise<void>;
}

type DependencyState = 'up' | 'down';

export function healthRouter(probes: HealthProbes | undefined): Router {
    const router = Router();

    router.get('/health', async (_req, res) => {
        // The route stays unhealthy if composition forgot the probes. It must
        // never claim readiness merely because the HTTP process is alive.
        const results = probes === undefined
            ? [undefined, undefined]
            : await Promise.allSettled([probes.database(), probes.broker()]);
        const database: DependencyState = results[0]?.status === 'fulfilled' ? 'up' : 'down';
        const broker: DependencyState = results[1]?.status === 'fulfilled' ? 'up' : 'down';
        const ready = database === 'up' && broker === 'up';

        // Public by design: only fixed labels, never exceptions, versions,
        // internal addresses or identifiers are exposed to the caller.
        res.set('Cache-Control', 'no-store');
        const response: HealthResponseDto = {
            status: ready ? 'ready' : 'unavailable',
            dependencies: { database, broker },
        };
        res.status(ready ? 200 : 503).json(response);
    });

    return router;
}
