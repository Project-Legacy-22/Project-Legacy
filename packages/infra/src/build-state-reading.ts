import type { StateReading } from '@legacy/contracts';

// Which build answered, as labels on a series whose value is always 1.
//
// The shape Prometheus calls an info metric: the number carries nothing, the
// labels carry everything, and a panel reads the labels of the latest sample.
// It exists so that a dip on a graph can be put next to a delivery -- without
// it, the chain of deliveries is visible in the repository and invisible in
// the measurements.
//
// Why a reading rather than a constant set once at startup: on this target
// there is no startup to speak of. Each instance answers with the labels of
// the deployment it belongs to, which is exactly what we want to know.

// Structurally what Config.deployment holds. Declared here rather than
// imported because packages/ may not reach into apps/, and three string
// fields cost less than a shared type that would exist only to be shared.
export interface BuildIdentity {
    commit: string;
    ref: string;
    environment: string;
}

export function createBuildStateReading(build: BuildIdentity): StateReading {
    return {
        name: 'legacy22_build_info',
        help: 'The deployment that answered, as labels. The value is always 1.',
        // Bounded on purpose: one series per delivery, which is a handful a
        // week. A label that changed per invocation -- an instance id, a
        // request id -- would multiply the series without bound, and that is
        // how a free Grafana plan stops accepting writes.
        labels: {
            commit: build.commit,
            ref: build.ref,
            environment: build.environment,
        },
        read: () => Promise.resolve(1),
    };
}
