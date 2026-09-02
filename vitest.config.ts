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
            reporter: ['text', 'html'],
            // Un seuil ne s active qu une fois franchissable : le rendre
            // bloquant avant d avoir livre de quoi le franchir arreterait toute
            // l equipe, y compris les PR qui apportent les tests manquants.
            //
            // Lignes, declarations et fonctions sont au niveau decide, 70 %.
            // Les branches sont posees au plancher atteint aujourd hui : le seul
            // fichier qui les tire vers le bas est l adaptateur MySQL, qu on ne
            // peut pas exercer sans serveur reel et que EN-09 remplacera par
            // Supabase. Ce plancher ne peut que monter, jamais descendre.
            thresholds: {
                lines: 70,
                statements: 70,
                functions: 70,
                branches: 52,
            },
            reportsDirectory: 'coverage',
            include: ['apps/**/src/**/*.{ts,tsx}', 'packages/**/src/**/*.ts'],
            exclude: [
                '**/*.test.{ts,tsx}',
                '**/test/**',
                // Composition root and config only wire things together; a
                // domain rule tested through them would be an integration
                // test wearing a unit test's clothes. Excluded per
                // standards/03-testing.md section 7.
                'apps/api/src/composition-root.ts',
                'apps/api/src/config.ts',
                'apps/api/src/index.ts',
                // Front composition root: it mounts the app and nothing else,
                // exactly like the API entry point above.
                'apps/web/src/main.tsx',
                'apps/api/src/static/**',
            ],
        },
    },
});
