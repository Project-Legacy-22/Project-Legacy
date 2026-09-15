import { Counter, Histogram, Registry } from 'prom-client';

import type { Measurement, Metrics } from '@legacy/contracts';

// The measurement adapter. It knows prom-client; nobody else does.
//
// What it emits carries no personal data: no account identifier, no address,
// no task name, no IP address, neither as a value nor as a label (ADR-0016).
// The route label arrives already sanitised from the HTTP layer, the only one
// that knows what a route pattern is.
const SECOND_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

export function createPrometheusMetrics(): Metrics {
    const registry = new Registry();

    const requests = new Counter({
        name: 'legacy22_http_requests_total',
        help: 'Requests served, by method, route pattern and status code.',
        labelNames: ['method', 'route', 'status'],
        registers: [registry],
    });

    const duration = new Histogram({
        name: 'legacy22_http_request_duration_seconds',
        help: 'Request duration, by method and route pattern.',
        labelNames: ['method', 'route'],
        buckets: SECOND_BUCKETS,
        registers: [registry],
    });

    return {
        observe({ method, route, status, seconds }: Measurement) {
            requests.inc({ method, route, status: String(status) });
            duration.observe({ method, route }, seconds);
        },

        async render() {
            return { contentType: registry.contentType, body: await registry.metrics() };
        },
    };
}
