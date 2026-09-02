import { loadConfig } from './config.js';
import { compose } from './composition-root.js';
import { createServer } from './http/server.js';

const config = loadConfig();
const application = compose(config);
const { logger } = application;

application
    .start()
    .then(() => {
        const app = createServer(config, application.useCases, logger);
        app.listen(config.port, () =>
            logger.info({ port: config.port, driver: config.persistence.driver }, 'server started'),
        );
    })
    .catch((err: unknown) => {
        logger.fatal({ err }, 'server failed to start');
        process.exit(1);
    });

const gracefulShutdown = (): void => {
    application
        .stop()
        .catch((err: unknown) => {
            // Reported rather than swallowed: a driver that fails to close is a
            // fact worth having in the log, but it must not block the exit.
            logger.warn({ err }, 'persistence did not shut down cleanly');
        })
        .then(() => process.exit());
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGUSR2', gracefulShutdown); // Sent by nodemon
