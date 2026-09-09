import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LEVELS } from '../vitest.levels.js';
import type { Level } from '../vitest.levels.js';

// A test file that matches no level is run by nothing, and nothing says so:
// the suite just gets quieter, and a guarantee disappears without a single
// failure. A file matching two would be run twice and counted twice.
//
// These two tests are the reason vitest.levels.ts exists. They read the same
// patterns the configs read, so a file added outside every level fails loudly.

// git rather than a directory walk: it already knows what is versioned, so
// node_modules, dist and coverage need no exclusion list that could drift.
//
// import.meta.dirname and not new URL('..', import.meta.url).pathname: the
// latter percent-encodes, and this repository sits under a path with a space
// in it, which turned the working directory into one that does not exist.
function fichiersDeTest(): string[] {
    const sortie = execFileSync('git', ['ls-files', '*.test.ts', '*.test.tsx'], {
        encoding: 'utf8',
        cwd: join(import.meta.dirname, '..'),
    });

    return sortie.split('\n').filter(ligne => ligne !== '');
}

// The subset of glob syntax these patterns use, and no more: a double star for
// any depth of directory, a single star inside one segment, braces for an
// alternative. Written out rather than pulling in a matcher for eight patterns.
function versExpression(motif: string): string {
    let expression = '';
    let position = 0;

    while (position < motif.length) {
        const reste = motif.slice(position);

        if (reste.startsWith('**/')) {
            expression += '(?:[^/]+/)*';
            position += 3;
        } else if (reste.startsWith('*')) {
            expression += '[^/]*';
            position += 1;
        } else if (reste.startsWith('{')) {
            const fin = motif.indexOf('}', position);
            const choix = motif.slice(position + 1, fin).split(',');
            expression += `(?:${choix.join('|')})`;
            position = fin + 1;
        } else {
            expression += reste[0] === '.' ? '\\.' : reste[0];
            position += 1;
        }
    }

    return expression;
}

function niveauxDe(chemin: string): Level[] {
    return (Object.keys(LEVELS) as Level[]).filter(niveau =>
        LEVELS[niveau].some(motif => new RegExp(`^${versExpression(motif)}$`, 'u').test(chemin)),
    );
}

describe('la partition des niveaux de test', () => {
    it('donne un niveau a chaque fichier de test versionne', () => {
        const orphelins = fichiersDeTest().filter(chemin => niveauxDe(chemin).length === 0);

        expect(orphelins).toEqual([]);
    });

    it('n en donne jamais deux au meme fichier', () => {
        const partages = fichiersDeTest()
            .map(chemin => ({ chemin, niveaux: niveauxDe(chemin) }))
            .filter(({ niveaux }) => niveaux.length > 1)
            .map(({ chemin, niveaux }) => `${chemin} : ${niveaux.join(' et ')}`);

        expect(partages).toEqual([]);
    });
});
