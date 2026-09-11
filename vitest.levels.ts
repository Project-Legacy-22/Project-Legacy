// The four levels of the test pyramid, as glob patterns, in one place.
//
// They live here rather than inline in each config because the partition has
// to hold: a test file matching no level is never run by anything, and nothing
// would say so -- the suite would simply get quieter. test/test-levels.test.ts
// reads these patterns and refuses that.
//
// docs/testing-levels.md says what each level means, what a test there may
// assume, and what does not belong in it.

export const LEVELS = {
    // No server, no real service. Everything behind a port is a hand-written
    // fake, the clock and the identifier generator are injected.
    unit: [
        'packages/**/*.test.ts',
        // The guard below lives at this level too: it needs no server and no
        // real service, only git and these patterns.
        'test/*.test.ts',
        'apps/api/src/after-write.test.ts',
        'apps/api/src/item-use-cases.test.ts',
        'apps/api/src/config.test.ts',
        // Composition only, plus the one refusal start() owes before it dials
        // anything: no server and no real service are involved.
        'apps/api/src/composition-root.test.ts',
        // Same nature as the API's: it validates an environment schema and
        // needs no server or real service.
        'apps/worker/src/config.test.ts',
        'apps/api/src/http/cookies.test.ts',
        // Builds the application without listening, to compare the routes it
        // mounts with what vercel.json makes reachable. No server, no service.
        'apps/api/src/http/vercel-rewrites.test.ts',
    ],

    // A real Express server on port 0, queried by fetch, fakes behind the
    // ports.
    http: [
        'apps/api/src/http/routes/**/*.test.ts',
        // Boots the same real server, for what the whole app answers rather
        // than one route: headers, CORS, body limits.
        'apps/api/src/http/security.test.ts',
    ],

    // Components mounted in jsdom, queried through src/test/react-root.tsx.
    //
    // apps/web/vitest.config.ts repeats this set expressed from its own
    // directory, because that is where its jsdom setup lives. The two cannot
    // drift unnoticed: a file one of them stops matching becomes an orphan for
    // test/test-levels.test.ts.
    dom: ['apps/web/src/**/*.test.{ts,tsx}'],

    // A real route, a real database. Its own config and its own command: it
    // needs the local Supabase stack, which npm test must not require.
    integration: ['apps/api/test/integration/**/*.test.ts'],
} as const;

export type Level = keyof typeof LEVELS;
