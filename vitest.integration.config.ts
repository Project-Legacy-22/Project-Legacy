import { defineConfig } from 'vitest/config';

// Separate from vitest.config.ts on purpose: these tests need the local
// Supabase stack (`npm run db:start`) and are never part of `npm test`, which
// every contributor runs on every change and which feeds the coverage gate.
// Run with `npm run test:integration`.
export default defineConfig({
    resolve: {
        conditions: ['development'],
    },
    test: {
        name: 'integration',
        include: ['apps/api/test/integration/**/*.test.ts'],
        environment: 'node',
        // A real backend, not a fake reset between tests: two files creating
        // accounts and rows at the same time is not a scenario worth
        // debugging for the seconds it would save.
        fileParallelism: false,
        testTimeout: 15_000,
    },
});
