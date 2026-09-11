import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

// An invalid stylesheet used to pass the whole suite.
//
// jsdom builds no CSS tree: it drops a rule it cannot parse without saying so,
// and the suites that mount components query the DOM, never the cascade. The
// two tests that do read these files -- contrast and motion -- read them as
// text, with regular expressions, so a missing brace bothers neither.
//
// It happened: a conflict resolution in auth.css kept both sides while the
// closing brace sat in the common region after the marker, one brace for two
// blocks. 392 tests stayed green while the Build job went red.
//
// So the parser here is the one that compiles the project. postcss is what vite
// runs over these files -- it produced the message that revealed the defect --
// rather than a hand-written brace counter that would miss every other kind of
// syntax error.

const DOSSIER = import.meta.dirname;

function feuilles(): readonly string[] {
    return readdirSync(DOSSIER)
        .filter(nom => nom.endsWith('.css'))
        .sort();
}

interface Faute {
    fichier: string;
    ligne: number | undefined;
    raison: string;
}

function analyser(nom: string): Faute | undefined {
    const source = readFileSync(join(DOSSIER, nom), 'utf8');

    try {
        postcss.parse(source, { from: join(DOSSIER, nom) });
        return undefined;
    } catch (error) {
        // A CssSyntaxError carries the line and the reason. Anything else is a
        // failure of this test, not of the stylesheet, and must not be reported
        // as one.
        if (!(error instanceof Error) || error.name !== 'CssSyntaxError') throw error;

        const { line, reason } = error as Error & { line?: number; reason?: string };
        return { fichier: nom, ligne: line, raison: reason ?? error.message };
    }
}

describe('les feuilles de style', () => {
    it('sont analysables par l analyseur qui les compile', () => {
        const fautes = feuilles()
            .map(analyser)
            .filter((faute): faute is Faute => faute !== undefined);

        // Reported as a list rather than one failure per file: a bad merge
        // usually breaks one file, and naming it with its line is what saves
        // the round trip through the CI.
        expect(fautes).toEqual([]);
    });

    it('sont assez nombreuses pour que le test ci-dessus prouve quelque chose', () => {
        // The reader depends on a directory layout that could change. An empty
        // list of files would pass the assertion above without reading a thing.
        expect(feuilles().length).toBeGreaterThan(5);
    });
});
