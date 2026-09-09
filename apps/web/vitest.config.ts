import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // The level, not the runtime: components mounted in jsdom and queried
        // through src/test/react-root.tsx. See docs/testing-levels.md.
        name: 'dom',
        // The same set as LEVELS.dom in vitest.levels.ts, expressed from this
        // directory. Left explicit rather than inherited: the default would
        // also take .spec files and any future directory, and the repo-root
        // partition would no longer describe what runs.
        include: ['src/**/*.test.{ts,tsx}'],
        environment: 'jsdom',
        clearMocks: true,
    },
});
