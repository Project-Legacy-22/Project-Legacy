// Checks the dependency rule of standards/01-architecture.md section 2.3.
//
// Why a script rather than a package graph: npm workspaces hoists every
// workspace and every third-party package into the root node_modules, so a file
// in packages/core can resolve `express` even though its package.json declares
// no such dependency. TypeScript resolves it too and compiles happily. The
// package boundary therefore documents the intent; it does not enforce it.
//
// dependency-cruiser is the tool named for this in the CI pipeline. Until it is
// added, this script is the enforcement, wired into `npm run typecheck`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = join(import.meta.dirname, '..');

// Each rule matches a source path and lists what that path may import.
// `bare` covers package specifiers, `local` covers relative ones.
const RULES = [
    {
        name: 'domain imports nothing outside itself',
        match: /^packages\/core\/[^/]+\/src\/domain\//,
        bare: [],
        // Only within its own directory: any '../' leaves the domain.
        local: /^\.\//,
    },
    {
        name: 'application depends only on domain and ports',
        match: /^packages\/core\/[^/]+\/src\/application\//,
        bare: [],
        local: /^\.\.?\/((domain|ports)\/|[^/]+\.js$)/,
    },
    {
        name: 'ports depend only on domain',
        match: /^packages\/core\/[^/]+\/src\/ports\//,
        bare: [],
        local: /^\.\.?\/(domain\/|[^/]+\.js$)/,
    },
    {
        name: 'a core package pulls in no framework and no other core package',
        match: /^packages\/core\//,
        bare: [],
        local: /^\.\.?\//,
    },
    {
        name: 'contracts depends on no other workspace package',
        match: /^packages\/contracts\//,
        bare: [/^zod$/, /^node:/],
        local: /^\.\.?\//,
    },
    {
        name: 'infra knows contracts and core ports, never an application layer',
        match: /^packages\/infra\//,
        bare: [/^@legacy\/(contracts|core-items|core-auth)$/, /^node:/, /^(@supabase\/supabase-js|pino)$/],
        local: /^\.\.?\//,
    },
    {
        name: 'only the composition root reaches for an adapter',
        match: /^apps\/api\/src\/(?!composition-root\.ts$)/,
        bare: [/^@legacy\/(contracts|core-items|core-auth)$/, /^node:/, /^(express|zod|uuid)$/],
        local: /^\.\.?\//,
    },
    {
        name: 'web tests use only browser dependencies and test tools',
        match: /^apps\/web\/src\/.*\.test\.tsx?$/,
        bare: [
            /^@legacy\/contracts$/,
            /^react(?:\/.*)?$/,
            /^react-dom(?:\/.*)?$/,
            /^(axe-core|vitest)$/,
        ],
        local: /^\.\.?\//,
    },
    {
        name: 'web production code depends only on contracts and browser libraries',
        match: /^apps\/web\/src\//,
        bare: [/^@legacy\/contracts$/, /^react(?:\/.*)?$/, /^react-dom(?:\/.*)?$/],
        local: /^\.\.?\//,
    },
    {
        name: 'web build configuration uses only its declared build tools',
        match: /^apps\/web\/(vite|vitest)\.config\.ts$/,
        bare: [/^@vitejs\/plugin-react$/, /^vite$/, /^vitest\/config$/],
        local: /^\.\.?\//,
    },
];

function sourceFiles(dir) {
    const found = [];
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === 'dist' || entry === 'static') continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
        // A test file is not part of the production dependency graph this
        // script protects: it legitimately imports its test runner as a bare
        // specifier (forbidden for e.g. domain/, which may import nothing)
        // and reaches into test/ for fakes and builders.
        else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(full);
    }
    return found;
}

// Matches `import ... from 'x'`, `export ... from 'x'` and `import 'x'`,
// including their type-only forms. A type-only import is still a dependency:
// it ties the layer to a shape it must not know about.
const SPECIFIER = /(?:^|\n)\s*(?:import|export)(?:\s+type)?[\s\S]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;

function specifiers(content) {
    return [...content.matchAll(SPECIFIER)].map(m => m[1] ?? m[2]).filter(s => s !== undefined);
}

function fileViolations(path, content, rule) {
    const found = [];

    for (const specifier of specifiers(content)) {
        const isRelative = specifier.startsWith('.');
        const allowed = isRelative
            ? rule.local.test(specifier)
            : rule.bare.some(pattern => pattern.test(specifier));

        if (!allowed) found.push({ path, specifier, rule: rule.name });
    }

    return found;
}

const violations = [];

for (const dir of ['apps', 'packages']) {
    for (const file of sourceFiles(join(root, dir))) {
        const path = relative(root, file).split(sep).join('/');
        const rule = RULES.find(r => r.match.test(path));
        if (!rule) continue;

        violations.push(...fileViolations(path, readFileSync(file, 'utf8'), rule));
    }
}

if (violations.length > 0) {
    console.error('\n  Regle de dependance entre couches violee :\n');
    for (const v of violations) {
        console.error(`    ${v.path}`);
        console.error(`      importe "${v.specifier}"`);
        console.error(`      regle : ${v.rule}\n`);
    }
    console.error('  Voir standards/01-architecture.md section 2.3.\n');
    process.exit(1);
}

console.log(`frontieres respectees`);
