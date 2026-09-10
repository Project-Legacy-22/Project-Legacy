import { defineConfig } from 'vitest/config';

import { LEVELS } from './vitest.levels.js';

export default defineConfig({
    resolve: {
        // Matches the `--conditions=development` flag the dev script passes to
        // tsx: workspace packages resolve to their TypeScript source instead of
        // dist/, so tests run without a prior build.
        conditions: ['development'],
    },
    test: {
        // One command, one coverage report. Splitting `test` itself into
        // several runs would produce partial reports, and any threshold read
        // from either would be meaningless -- so the projects below are a way
        // to run one level alone, never a way to split `npm test`.
        //
        // They are named after the level they belong to, not the runtime they
        // need: `node` and `jsdom` describe an environment, which says nothing
        // about what a test may assume. docs/testing-levels.md holds the
        // classification.
        projects: [
            {
                extends: true,
                test: {
                    // No server, no real service, everything behind a port is a
                    // hand-written fake. Domain and application cases, the
                    // shared contracts, the outbound adapters against fakes,
                    // and the pure helpers of apps/api.
                    name: 'unit',
                    include: [...LEVELS.unit],
                    environment: 'node',
                },
            },
            {
                extends: true,
                test: {
                    // A real Express server on port 0, queried by fetch, with
                    // fakes behind the ports. Slower than a unit test and
                    // deliberately so: it is the wiring of a route that is
                    // under test, not the rule it delegates to.
                    name: 'http',
                    include: [...LEVELS.http],
                    environment: 'node',
                },
            },
            // Referenced by directory so apps/web keeps owning its own runtime
            // setup: jsdom, mock clearing, and whatever its Vite config adds.
            // Its name is set there, next to that setup.
            './apps/web',
        ],
        // apps/api/test/integration/** appears in no project above: it has its
        // own config (vitest.integration.config.ts) because it needs the local
        // Supabase stack, which npm test must not require on every change.
        coverage: {
            provider: 'v8',
            // text pour la console, html pour l inspection locale,
            // json-summary pour le resume publie sur la pull request par la CI,
            // lcov pour l analyse SonarCloud (EN-17).
            reporter: ['text', 'html', 'json-summary', 'lcov'],
            // Un seuil ne s active qu une fois franchissable : le rendre
            // bloquant avant d avoir livre de quoi le franchir arreterait toute
            // l equipe, y compris les PR qui apportent les tests manquants.
            //
            // Lignes, declarations et fonctions sont au niveau decide, 70 %.
            // Les branches sont posees au plancher atteint aujourd hui. Ce
            // plancher ne peut que monter, jamais descendre : EN-09 a supprime
            // l adaptateur MySQL, non testable sans serveur, qui les tirait a
            // 52 %.
            thresholds: {
                lines: 70,
                statements: 70,
                functions: 70,
                branches: 60,
            },
            reportsDirectory: 'coverage',
            include: ['apps/**/src/**/*.{ts,tsx}', 'packages/**/src/**/*.ts'],
            exclude: [
                '**/*.test.{ts,tsx}',
                '**/test/**',
                // Composition root and entry point only wire things together; a
                // domain rule tested through them would be an integration
                // test wearing a unit test's clothes. Excluded per
                // standards/03-testing.md section 7.
                //
                // config.ts is no longer among them. It stopped being wiring
                // when EN-30 gave it a schema to enforce: it now rejects a
                // missing variable and an out-of-range log level, which is
                // behaviour, is covered by config.test.ts, and would go
                // unmeasured here while SonarCloud still counts its lines as
                // new code.
                'apps/api/src/composition-root.ts',
                'apps/api/src/index.ts',
                // Le point d entree du worker, pour la meme raison que celui de
                // l API : il assemble et boucle. Ce qu il decide -- que faire
                // d un evenement -- vit dans event-consumer.ts, qui est teste.
                'apps/worker/src/index.ts',
                // Generated from the database schema by `npm run db:types`;
                // excluded per standards/03-testing.md section 7.
                'packages/infra/src/database.types.ts',
                // The Supabase adapters only translate port calls into
                // supabase-js calls and cannot be exercised without a real
                // PostgREST endpoint. Their round trip is covered by the
                // integration suite (EN-25), like every outbound adapter. What
                // the erasure adapter delegates to -- the erase_account
                // function -- is asserted against a real database by
                // scripts/check-schema.sql, which CI runs on every pull
                // request.
                'packages/infra/src/supabase-item-repository.ts',
                'packages/infra/src/supabase-project-repository.ts',
                'packages/infra/src/supabase-personal-data-store.ts',
                'packages/infra/src/outbox-store.ts',
                'packages/infra/src/notification-store.ts',
                'packages/infra/src/redis-event-bus.ts',
                // Front composition root: it mounts the app and nothing else,
                // exactly like the API entry point above.
                'apps/web/src/main.tsx',
                'apps/api/src/static/**',
            ],
        },
    },
});
