import { Counter, Histogram, Registry } from 'prom-client';
import { Router } from 'express';
import type { Request, RequestHandler } from 'express';

// Ce que l ADR-0016 autorise a sortir, et rien de plus.
//
// Aucune etiquette ne peut identifier une personne ni un objet qu elle a cree.
// La route est donc etiquetee par son motif -- `/projects/:projectId/items` --
// et jamais par le chemin recu : un identifiant de projet en etiquette serait a
// la fois une donnee personnelle et une cardinalite qui saturerait le palier
// gratuit. C est la regle, et un test la verifie sur une vraie requete.

const BUCKETS_SECONDES = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

export interface Metrics {
    registry: Registry;
    observe: RequestHandler;
    router: Router;
}

// Un segment qui identifie quelque chose : un UUID, ou un nombre. Remplace par
// un marqueur, jamais conserve.
const IDENTIFIANT = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/iu;

// Le motif de la route, pas le chemin recu.
//
// Express ne pose `req.route` qu apres routage, donc une requete refusee par la
// garde de session n en a pas -- et c est le cas le plus fréquent sur ce
// service. Retomber sur une valeur fixe collapserait tous les refus dans un
// seul seau, et on perdrait quelle route a ete appelee ; retomber sur le chemin
// brut y mettrait des identifiants. Le chemin est donc assaini segment par
// segment.
function motifDeRoute(req: Request): string {
    const route: unknown = (req as { route?: { path?: unknown } }).route?.path;

    if (typeof route === 'string' && route !== '') {
        return `${req.baseUrl}${route}`;
    }

    return req.path
        .split('/')
        .map(segment => (IDENTIFIANT.test(segment) ? ':id' : segment))
        .join('/');
}

export function createMetrics(secret: string): Metrics {
    const registry = new Registry();

    const requetes = new Counter({
        name: 'legacy22_http_requests_total',
        help: 'Requetes servies, par methode, motif de route et code de statut.',
        labelNames: ['method', 'route', 'status'],
        registers: [registry],
    });

    const duree = new Histogram({
        name: 'legacy22_http_request_duration_seconds',
        help: 'Duree d une requete, par methode et motif de route.',
        labelNames: ['method', 'route'],
        buckets: BUCKETS_SECONDES,
        registers: [registry],
    });

    const observe: RequestHandler = (req, res, next) => {
        const depart = process.hrtime.bigint();

        res.on('finish', () => {
            const route = motifDeRoute(req);
            const secondes = Number(process.hrtime.bigint() - depart) / 1e9;

            requetes.inc({ method: req.method, route, status: String(res.statusCode) });
            duree.observe({ method: req.method, route }, secondes);
        });

        next();
    };

    const router = Router();

    // Meme secret que le declencheur de relais, presente par le scrutateur.
    // Ces mesures ne portent aucune donnee personnelle, mais elles decrivent
    // l interieur du service : les exposer publiquement apprendrait a un
    // inconnu quelles routes existent et laquelle est lente.
    const servir: RequestHandler = (req, res, next) => {
        if (req.headers['x-relay-secret'] !== secret) {
            res.status(403).send({ type: 'forbidden', title: 'Forbidden', status: 403 });
            return;
        }

        registry
            .metrics()
            .then(corps => {
                res.type(registry.contentType).send(corps);
            })
            .catch(next);
    };

    router.get('/internal/metrics', servir);

    return { registry, observe, router };
}
