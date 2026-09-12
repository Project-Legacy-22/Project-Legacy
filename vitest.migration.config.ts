import { defineConfig } from 'vitest/config';

import { LEVELS } from './vitest.levels.js';

// Separate from vitest.config.ts, like the integration level and for the same
// reason: this suite needs three database engines up, so it is never part of
// `npm test` and never feeds the coverage gate. Run it with
// `npm run test:migration`, which starts the containers first.
export default defineConfig({
    resolve: {
        conditions: ['development'],
    },
    test: {
        name: 'migration',
        include: [...LEVELS.migration],
        environment: 'node',
        // The files share three databases and remake them: running two at
        // once would have them fight over the same names.
        fileParallelism: false,
        // Creating a database, applying a schema and dumping it are each a
        // container round trip. The whole suite takes well under a minute; a
        // single test occasionally takes several seconds.
        testTimeout: 60_000,
        hookTimeout: 60_000,
    },
});
