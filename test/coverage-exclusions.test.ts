import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// Two files have to say the same thing, and nothing made them.
//
// vitest.config.ts decides what the coverage report measures;
// sonar-project.properties decides what the quality gate measures. A file
// excluded from one and not the other is counted by one of them alone, and the
// gate then fails on lines the local report never showed as missing.
//
// It happened while this test was being written: supabase-project-repository
// was excluded in vitest.config.ts and not in sonar-project.properties, so
// SonarCloud refused a pull request on two lines nobody could see locally. That
// is what #180 is about, and this is the part of it that stops it recurring.
//
// Only the source exclusions are compared. Both files also exclude tests and
// generated output, in shapes their own tools understand -- '**/*.test.{ts,tsx}'
// against '**/test/**' -- and forcing those to match would compare glob
// dialects rather than intent.

const RACINE = join(import.meta.dirname, '..');

// A source file, as opposed to a family: anything with a star is a family, and
// the two tools spell families differently.
function fichiersSource(candidats: Iterable<string>): ReadonlySet<string> {
    const trouves = new Set<string>();
    for (const candidat of candidats) {
        const propre = candidat.trim();
        if (propre !== '' && !propre.includes('*') && /\.tsx?$/u.test(propre)) trouves.add(propre);
    }
    return trouves;
}

function exclusionsDeVitest(): ReadonlySet<string> {
    const source = readFileSync(join(RACINE, 'vitest.config.ts'), 'utf8');
    const bloc = /exclude:\s*\[([\s\S]*?)\]/u.exec(source);
    if (bloc === null) throw new Error('vitest.config.ts declares no coverage exclude list');

    // Comments first: this list is more comment than entry, and the prose names
    // files it is not excluding -- the first version of this test read those
    // and reported four divergences that were sentences.
    const sansCommentaires = (bloc[1] ?? '').replace(/^\s*\/\/.*$/gmu, '');
    const entrees = [...sansCommentaires.matchAll(/'([^']+)'/gu)].map(trouve => trouve[1] ?? '');

    return fichiersSource(entrees);
}

function exclusionsDeSonar(): ReadonlySet<string> {
    const source = readFileSync(join(RACINE, 'sonar-project.properties'), 'utf8');
    const ligne = /^sonar\.coverage\.exclusions=(.*)$/mu.exec(source);
    if (ligne === null) throw new Error('sonar-project.properties declares no coverage exclusions');

    return fichiersSource((ligne[1] ?? '').split(','));
}

describe('les deux listes d exclusion de couverture', () => {
    it('excluent les memes fichiers source', () => {
        const vitest = exclusionsDeVitest();
        const sonar = exclusionsDeSonar();

        const absentsDeSonar = [...vitest].filter(chemin => !sonar.has(chemin)).sort();
        const absentsDeVitest = [...sonar].filter(chemin => !vitest.has(chemin)).sort();

        expect({ absentsDeSonar, absentsDeVitest }).toEqual({
            absentsDeSonar: [],
            absentsDeVitest: [],
        });
    });

    it('ne sont pas vides, sans quoi le test ci-dessus passerait pour rien', () => {
        // Both readers depend on a shape the file could lose -- a renamed key,
        // a reformatted array. An empty set on each side would compare equal
        // and prove nothing.
        expect(exclusionsDeVitest().size).toBeGreaterThan(3);
        expect(exclusionsDeSonar().size).toBeGreaterThan(3);
    });
});
