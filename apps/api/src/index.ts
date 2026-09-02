import { loadConfig } from './config.js';
import { compose } from './composition-root.js';
import { createServer } from './http/server.js';

const config = loadConfig();
const application = compose(config);

application
    .start()
    .then(() => {
        const app = createServer(config, application.useCases);
        app.listen(config.port, () => console.log(`Listening on port ${config.port}`));
    })
    .catch((err: unknown) => {
        console.error(err);
        process.exit(1);
    });

const gracefulShutdown = (): void => {
    application
        .stop()
        .catch(() => {})
        .then(() => process.exit());
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGUSR2', gracefulShutdown); // Sent by nodemon
