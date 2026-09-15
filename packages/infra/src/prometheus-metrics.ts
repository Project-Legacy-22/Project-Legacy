import { Counter, Histogram, Registry } from 'prom-client';

import type { Logger, Measurement, Metrics, StateReading, StateValue } from '@legacy/contracts';

// The measurement adapter. It knows prom-client; nobody else does.
//
// What it emits carries no personal data: no account identifier, no address,
// no task name, no IP address, neither as a value nor as a label (ADR-0016).
// The route label arrives already sanitised from the HTTP layer, the only one
// that knows what a route pattern is.
const SECOND_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

// How many state readings could not be taken on this call.
//
// Without it, a failed reading would be indistinguishable from a reading that
// was never configured -- both absent -- and the absence would be silent. This
// series turns the failure into a number someone can graph and alert on.
const FAILED = 'legacy22_state_readings_failed';
const FAILED_HELP = 'State readings that could not be taken on this call.';

export interface MetricsOptions {
    // Read when the endpoint is asked, in the order given. Empty is a valid
    // service: the HTTP measurements below need no adapter of their own.
    readings?: readonly StateReading[];
    logger?: Logger;
}

// A reading and what it answered, kept together until the last moment.
//
// The exposition needs the help text, the JSON does not. Putting `help` into
// StateValue would send it to every dashboard response for no reader; keeping
// the reading instead lets each renderer take what it needs.
interface Taken {
    reading: StateReading;
    value: number;
}

// Quotes and backslashes are escaped because the exposition format gives them
// a meaning inside a label value. Neither can occur in what we write today --
// a commit is hexadecimal, a branch name has neither -- but the escape belongs
// with the renderer rather than with the trust that no future label will.
function labelPart(labels: Readonly<Record<string, string>> | undefined): string {
    const pairs = Object.entries(labels ?? {}).map(
        ([key, value]) => `${key}="${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`,
    );

    return pairs.length === 0 ? '' : `{${pairs.join(',')}}`;
}

function gaugeLines(
    gauge: { name: string; help: string; labels?: Readonly<Record<string, string>> },
    value: number,
): string[] {
    return [
        `# HELP ${gauge.name} ${gauge.help}`,
        `# TYPE ${gauge.name} gauge`,
        `${gauge.name}${labelPart(gauge.labels)} ${value}`,
    ];
}

// Nothing rather than zero when a reading fails.
//
// A count that did not load is not a count of zero, and a panel showing « 0
// tasks » because the database was slow states something false with the same
// confidence as the truth. An absent series reads as « no measurement », which
// is what actually happened. The one exception is a reading whose failure *is*
// the measurement -- see legacy22_redis_up -- and that one returns 0 itself
// rather than throwing.
async function take(
    reading: StateReading,
    logger: Logger | undefined,
): Promise<Taken | undefined> {
    try {
        return { reading, value: await reading.read() };
    } catch (err: unknown) {
        logger?.warn({ err, reading: reading.name }, 'state reading failed, series omitted');
        return undefined;
    }
}

// Every reading is taken, even when one of them throws: what could be
// gathered must still be served. A single slow table would otherwise take the
// whole of the observability down with it.
async function takeAll(
    readings: readonly StateReading[],
    logger: Logger | undefined,
): Promise<{ taken: Taken[]; failed: number }> {
    const results = await Promise.all(readings.map(one => take(one, logger)));
    const taken = results.filter((one): one is Taken => one !== undefined);

    return { taken, failed: results.length - taken.length };
}

function stateExposition({ taken, failed }: { taken: Taken[]; failed: number }): string {
    return [
        ...taken.flatMap(one => gaugeLines(one.reading, one.value)),
        ...gaugeLines({ name: FAILED, help: FAILED_HELP }, failed),
    ].join('\n');
}

function asValues({ taken, failed }: { taken: Taken[]; failed: number }): StateValue[] {
    const values = taken.map(one =>
        one.reading.labels === undefined
            ? { name: one.reading.name, value: one.value }
            : { name: one.reading.name, value: one.value, labels: one.reading.labels },
    );

    // Present in both shapes, for the same reason: without it, an absent
    // series cannot be told from a reading that was never configured.
    return [...values, { name: FAILED, value: failed }];
}

export function createPrometheusMetrics(options: MetricsOptions = {}): Metrics {
    const { readings = [], logger } = options;
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

        // The counted metrics and the read ones are rendered side by side, in
        // one exposition. The read ones are written by hand rather than through
        // a prom-client Gauge because an unlabelled Gauge always emits, and
        // defaults to zero: it has no way to say « this one could not be
        // read », which is the distinction the comment above exists for.
        async render() {
            const [counted, state] = await Promise.all([
                registry.metrics(),
                takeAll(readings, logger).then(stateExposition),
            ]);

            const parts = [counted.trimEnd(), state.trimEnd()].filter(part => part !== '');

            return { contentType: registry.contentType, body: `${parts.join('\n')}\n` };
        },

        // The same readings, taken the same way, for a caller that wants data
        // rather than an exposition. The counted metrics are not here: a
        // counter on this target says almost nothing -- the route label only
        // ever holds /internal/relay -- and a caller asking for the current
        // state has no use for one.
        async state() {
            return asValues(await takeAll(readings, logger));
        },
    };
}
