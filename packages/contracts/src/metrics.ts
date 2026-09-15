// What the application measures, as the HTTP layer sees it.
//
// The interface lives here and the implementation in packages/infra, for the
// reason the layer guard pointed out: only the composition root reaches an
// adapter, and prom-client is one. The HTTP layer knows what a route and a
// status code are; it has no reason to know the format these measurements come
// out in.
export interface Measurement {
    method: string;
    route: string;
    status: number;
    seconds: number;
}

export interface Metrics {
    observe(measurement: Measurement): void;
    render(): Promise<{ contentType: string; body: string }>;
}
