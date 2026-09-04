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
        ignores: [
            '**/dist/**',
            '**/coverage/**',
            '**/node_modules/**',
            'apps/api/src/static/**',
            // Generated from the database schema by `npm run db:types`. Its
            // shape is the CLI's to decide, not ours to lint.
            'packages/infra/src/database.types.ts',
        ],
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
                    './packages/core/auth/tsconfig.json',
                    './packages/infra/tsconfig.json',
                    './apps/api/tsconfig.json',
                    // apps/web carries its own project: JSX, DOM libs and the
                    // Vite client types. Omitting it leaves every .tsx file
                    // outside a typed program, and the typed rules then report
                    // each member access as unresolvable.
                    './apps/web/tsconfig.json',
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
        // so it cannot be part of a typed project. apps/web's own configs are
        // listed in its tsconfig, so they stay typed.
        files: ['*.config.js', '*.config.ts'],
        extends: [tseslint.configs.disableTypeChecked],
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
        // Code de test et son outillage. Les trois regles desactivees ici
        // visent des risques de production qui n existent pas en test.
        //
        // require-await : `act(async () => ...)` est la facon documentee par
        // React de demander la portee act asynchrone, qui vide les effets et
        // la file de microtaches. Le marqueur async est un signal d API, pas
        // un await oublie.
        //
        // unbound-method : extraire le setter de HTMLInputElement puis
        // l appeler avec `.call` est le seul moyen de declencher la detection
        // de changement de React sur un champ controle.
        //
        // max-lines-per-function : un bloc `describe` regroupe des tests. Le
        // plafond de 50 lignes vise une fonction de production, ou la
        // longueur signale qu elle fait trop de choses.
        files: ['**/*.test.ts', '**/*.test.tsx', '**/test/**/*.ts', '**/test/**/*.tsx'],
        rules: {
            '@typescript-eslint/require-await': 'off',
            '@typescript-eslint/unbound-method': 'off',
            'max-lines-per-function': 'off',
        },
    },
    prettier,
);
