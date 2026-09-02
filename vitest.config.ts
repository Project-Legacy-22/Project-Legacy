import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        // Matches the `--conditions=development` flag the dev script passes to
        // tsx: workspace packages resolve to their TypeScript source instead of
        // dist/, so tests run without a prior build.
        conditions: ['development'],
    },
    test: {
        include: ['apps/**/*.test.ts', 'packages/**/*.test.ts'],
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            reportsDirectory: 'coverage',
            include: ['apps/**/src/**/*.ts', 'packages/**/src/**/*.ts'],
            exclude: [
                '**/*.test.ts',
                '**/test/**',
                // Composition root and config only wire things together; a
                // domain rule tested through them would be an integration
                // test wearing a unit test's clothes. Excluded per
                // standards/03-testing.md section 7.
                'apps/api/src/composition-root.ts',
                'apps/api/src/config.ts',
                'apps/api/src/index.ts',
                'apps/api/src/static/**',
            ],
        },
    },
});
