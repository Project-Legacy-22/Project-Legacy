// Entry point of the API on Vercel.
//
// The front calls the API through relative paths so that the browser carries the session cookie by
// itself (see apps/web/vite.config.ts). Serving the API from another origin would put that cookie
// out of reach. The function therefore lives in the same project as the front, and `vercel.json`
// rewrites `/auth` and `/items` to it: a single origin as the browser sees it.
//
// Vercel expects an Express application exported by default. Nothing listens here: the platform
// takes care of it, unlike apps/api/src/index.ts, which keeps its `listen` for local runs and for
// the published image.
//
// `application.start()` is not called. It ran a health check of the database, useful to a
// long-running process that refuses to start misconfigured, and a function does not have that life
// cycle.
//
// Since US-10b it also starts the outbox relay, and that changes the reach of this absence: on this
// target, events pile up without anyone publishing them, so no notification appears. A function
// that ends with its response cannot hold an interval anyway. The choice belongs to `D-12`, the
// deployment target, still open in the backlog; the options are listed in
// docs/features/127-event-consumer-and-notifications.md.
import { compose } from '../apps/api/dist/composition-root.js';
import { loadConfig } from '../apps/api/dist/config.js';
import { createServer } from '../apps/api/dist/http/server.js';

const config = loadConfig();
const application = compose(config);

export default createServer(config, application.useCases, {
    logger: application.logger,
    metrics: application.metrics,
    health: application.health,
});
