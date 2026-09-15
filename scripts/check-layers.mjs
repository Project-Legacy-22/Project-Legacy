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
        // L outil de reprise et de sortie des donnees ne depend de rien, pas
        // meme de nos propres paquets : il sert le jour ou l application ne
        // tourne plus, ou ne tourne plus ici. Un outil de sortie qui depend de
        // ce qu on quitte n est pas un outil de sortie.
        name: 'the data migration tool depends on nothing',
        match: /^packages\/data-migration\//,
        bare: [/^node:/],
        local: /^\.\.?\//,
    },
    {
        name: 'infra knows contracts and core ports, never an application layer',
        match: /^packages\/infra\//,
        bare: [
            /^@legacy\/(contracts|core-items|core-auth|core-notifications|core-projects)$/,
            /^node:/,
            /^(@supabase\/supabase-js|pino|@redis\/client|prom-client)$/,
        ],
        local: /^\.\.?\//,
    },
    {
        // Le worker est un consommateur : il assemble des adaptateurs et n a
        // aucune logique metier a lui. Il n atteint donc jamais un domaine
        // directement, seulement infra et les contrats.
        name: 'the worker composes adapters and holds no domain logic',
        match: /^apps\/worker\//,
        bare: [/^@legacy\/(contracts|infra)$/, /^node:/, /^zod$/],
        local: /^\.\.?\//,
    },
    {
        name: 'only the composition root reaches for an adapter',
        match: /^apps\/api\/src\/(?!composition-root\.ts$)/,
        bare: [
            /^@legacy\/(contracts|core-items|core-auth|core-notifications|core-projects)$/,
            /^node:/,
            /^(express|helmet|zod|uuid)$/,
        ],
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

// A path no rule matches was not checked at all, and the script still printed
// « frontieres respectees » -- green while guarding nothing. The partition has
// to be total: every source file is covered by a rule, or listed here with the
// reason it is not. Same failure mode as an undeclared test level, which
// test/test-levels.test.ts already refuses.
const EXEMPT = [
    {
        match: /^apps\/api\/src\/composition-root\.ts$/,
        why: 'la racine de composition est, par definition, le seul endroit qui atteint un adaptateur',
    },
    {
        match: /^apps\/api\/test\//,
        why: 'du code de support de test : il importe son outillage et des doubles, comme les fichiers .test.ts que sourceFiles ecarte deja',
    },
];

function isExempt(path) {
    return EXEMPT.some(exemption => exemption.match.test(path));
}

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
const unruled = [];

function inspect(file, intoViolations, intoUnruled) {
    const path = relative(root, file).split(sep).join('/');
    const rule = RULES.find(r => r.match.test(path));

    if (rule === undefined) {
        if (!isExempt(path)) intoUnruled.push(path);
        return;
    }

    intoViolations.push(...fileViolations(path, readFileSync(file, 'utf8'), rule));
}

for (const dir of ['apps', 'packages']) {
    for (const file of sourceFiles(join(root, dir))) inspect(file, violations, unruled);
}

if (unruled.length > 0) {
    console.error('\n  Aucune regle de dependance ne couvre ces fichiers :\n');
    for (const path of unruled) console.error(`    ${path}`);
    console.error(
        '\n  Un chemin sans regle n est pas verifie, et ce controle le dirait quand meme vert.\n' +
            '  Ajouter une regle dans RULES, ou une exemption dans EXEMPT avec sa raison.\n' +
            '  Voir standards/01-architecture.md section 2.3.\n',
    );
    process.exit(1);
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
