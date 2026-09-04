import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        // Matches the `--conditions=development` flag the dev script passes to
        // tsx: workspace packages resolve to their TypeScript source instead of
        // dist/, so tests run without a prior build.
        conditions: ['development'],
    },
    test: {
        // Two runtimes, one command, one coverage report. Splitting `test` into
        // a Node run and a web run would produce two partial reports, and any
        // threshold read from either would be meaningless.
        projects: [
            {
                extends: true,
                test: {
                    name: 'node',
                    include: ['apps/api/**/*.test.ts', 'packages/**/*.test.ts'],
                    environment: 'node',
                },
            },
            // Referenced by directory so apps/web keeps owning its own runtime
            // setup: jsdom, mock clearing, and whatever its Vite config adds.
            './apps/web',
        ],
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
                // Generated from the database schema by `npm run db:types`;
                // excluded per standards/03-testing.md section 7.
                'packages/infra/src/database.types.ts',
                // The Supabase adapter only translates port calls into
                // supabase-js calls and cannot be exercised without a real
                // PostgREST endpoint. Its round trip is covered by the
                // integration suite (EN-25), like every outbound adapter.
                'packages/infra/src/supabase-item-repository.ts',
                // Front composition root: it mounts the app and nothing else,
                // exactly like the API entry point above.
                'apps/web/src/main.tsx',
                'apps/api/src/static/**',
            ],
        },
    },
});
