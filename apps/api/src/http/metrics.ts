import { Router } from 'express';
import type { Request, RequestHandler } from 'express';

import type { Metrics } from '@legacy/contracts';

// Un segment qui identifie quelque chose : un UUID, ou un nombre. Remplace par
// un marqueur, jamais conserve.
const IDENTIFIANT = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/iu;

// Le motif de la route, pas le chemin recu.
//
// Express ne pose `req.route` qu apres routage, donc une requete refusee par la
// garde de session n en a pas -- et c est le cas le plus frequent sur ce
// service. Retomber sur une valeur fixe collapserait tous les refus dans un seul
// seau, et on perdrait quelle route a ete appelee ; retomber sur le chemin brut
// y mettrait des identifiants. Le chemin est donc assaini segment par segment.
export function motifDeRoute(req: Request): string {
    const route: unknown = (req as { route?: { path?: unknown } }).route?.path;

    if (typeof route === 'string' && route !== '') {
        return `${req.baseUrl}${route}`;
    }

    return req.path
        .split('/')
        .map(segment => (IDENTIFIANT.test(segment) ? ':id' : segment))
        .join('/');
}

export function observeRequests(metrics: Metrics): RequestHandler {
    return (req, res, next) => {
        const depart = process.hrtime.bigint();

        res.on('finish', () => {
            metrics.observe({
                method: req.method,
                route: motifDeRoute(req),
                status: res.statusCode,
                seconds: Number(process.hrtime.bigint() - depart) / 1e9,
            });
        });

        next();
    };
}

// Meme secret que le declencheur de relais. Ces mesures ne portent aucune
// donnee personnelle, mais elles decrivent l interieur du service : les exposer
// publiquement apprendrait a un inconnu quelles routes existent et laquelle est
// lente.
export function metricsRouter(metrics: Metrics, secret: string): Router {
    const router = Router();

    const servir: RequestHandler = (req, res, next) => {
        if (req.headers['x-relay-secret'] !== secret) {
            res.status(403).send({ type: 'forbidden', title: 'Forbidden', status: 403 });
            return;
        }

        metrics
            .render()
            .then(({ contentType, body }) => {
                res.type(contentType).send(body);
            })
            .catch(next);
    };

    router.get('/internal/metrics', servir);

    return router;
}
