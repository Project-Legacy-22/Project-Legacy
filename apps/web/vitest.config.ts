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
        // The default is five seconds, calibrated for tests that take twenty
        // milliseconds. The axe passes of this level do not: each one runs the
        // WCAG rule set over a whole rendered page, and the first one of a file
        // also pays axe-core's one-off setup.
        //
        // Measured on this suite under deliberate contention -- twelve busy
        // processes on eight cores, sixteen workers -- the three slowest tests
        // of the level are axe passes, at 4731, 3940 and 3589 milliseconds. The
        // first sat 269 milliseconds under the default, which is why #356 saw
        // it fail roughly one full run in four and never in isolation: the
        // assertion was right, the clock ran out.
        //
        // Four times the measured worst case. It leaves room for a slower
        // machine than this one -- a CI runner has fewer cores -- without
        // making a genuinely stuck test wait minutes to be reported.
        testTimeout: 20_000,
    },
});
