import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

// Complexity ceilings from standards/02-code-style.md section 4. Applied by
// ESLint rather than left to review, as that document requires.
const complexity = {
    'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
    'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
    complexity: ['error', 10],
    'max-depth': ['error', 3],
    'max-params': ['error', 3],
};

export default tseslint.config(
    {
        ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', 'apps/api/src/static/**'],
    },
    js.configs.recommended,
    // recommendedTypeChecked, not strictTypeChecked: standards/02-code-style.md
    // names any, no-floating-promises and the five complexity ceilings below
    // as the rules the team has actually ratified. strictTypeChecked's wider
    // opinions were never reviewed against the codebase and would flag
    // already-merged, unowned modules on their first lint run.
    ...tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                // Listed explicitly rather than via projectService's
                // auto-discovery: tsconfig.test.json is not named
                // tsconfig.json, so the service would never find it, and
                // every *.test.ts file would fail to parse.
                project: [
                    './packages/contracts/tsconfig.json',
                    './packages/core/items/tsconfig.json',
                    './packages/infra/tsconfig.json',
                    './apps/api/tsconfig.json',
                    './tsconfig.test.json',
                ],
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            ...complexity,
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            // Express's own type declarations augment Express.Locals through
            // a global namespace (see apps/api/src/http/trace.ts) -- the only
            // mechanism the library exposes for this.
            '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
            'no-console': 'error',
        },
    },
    {
        // Build-time scripts, not application code: they legitimately talk to
        // the console and are not type-checked project files.
        files: ['scripts/**/*.mjs'],
        extends: [tseslint.configs.disableTypeChecked],
        languageOptions: {
            globals: globals.node,
        },
        rules: {
            'no-console': 'off',
        },
    },
    {
        // Root tooling config: outside every package's tsconfig on purpose,
        // so it cannot be part of a typed project.
        files: ['*.config.js', '*.config.ts'],
        extends: [tseslint.configs.disableTypeChecked],
    },
    {
        // Express types res.locals as `LocalsObj & Locals` with LocalsObj
        // defaulting to Record<string, any>: intersecting any declared field
        // with that index signature collapses it back to `any` (TS quirk of
        // intersecting with any), so the augmentation in trace.ts cannot type
        // res.locals.traceId as string without threading a non-default
        // LocalsObj generic through every handler. Tracked as follow-up
        // debt rather than fixed here: out of EN-06's scope.
        files: ['apps/api/src/http/error-middleware.ts'],
        rules: {
            '@typescript-eslint/no-unsafe-assignment': 'off',
        },
    },
    {
        // Express only recognizes an error-handling middleware by its arity:
        // exactly four parameters, the unused one included. Not reducible to
        // three without breaking Express's own dispatch contract.
        files: ['apps/api/src/http/error-middleware.ts'],
        rules: {
            'max-params': 'off',
        },
    },
    {
        // Each function wraps one callback-style sqlite3/mysql2 driver call
        // per repository operation; splitting further would trade one large
        // function for several tiny ones that are only ever called once.
        // Tracked as follow-up debt (revisit once the driver calls are
        // promisified) rather than fixed here: out of EN-06's scope.
        files: [
            'packages/infra/src/sqlite-item-repository.ts',
            'packages/infra/src/mysql-item-repository.ts',
        ],
        rules: {
            'max-lines-per-function': 'off',
        },
    },
    prettier,
);
