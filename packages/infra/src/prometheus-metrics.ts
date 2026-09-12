import { Counter, Histogram, Registry } from 'prom-client';

import type { Measurement, Metrics } from '@legacy/contracts';

// L adaptateur de mesure. Il connait prom-client ; personne d autre ne le
// connait.
//
// Ce qu il sort ne porte aucune donnee personnelle : ni identifiant de compte,
// ni adresse, ni intitule de tache, ni adresse IP, en valeur comme en etiquette
// (ADR-0016). L etiquette de route arrive deja assainie par la couche HTTP, qui
// est la seule a savoir ce qu est un motif de route.
const BUCKETS_SECONDES = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

export function createPrometheusMetrics(): Metrics {
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

    return {
        observe({ method, route, status, seconds }: Measurement) {
            requetes.inc({ method, route, status: String(status) });
            duree.observe({ method, route }, seconds);
        },

        async render() {
            return { contentType: registry.contentType, body: await registry.metrics() };
        },
    };
}
