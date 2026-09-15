import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createReactTestRoot, getElement } from '../test/react-root';
import type { ReactTestRoot } from '../test/react-root';
import { PROCESSORS } from './policy-processors';
import { PrivacyPolicyPage } from './privacy-policy-page';

// La page publique que quelqu un lit avant de decider s il cree un compte. Elle
// n avait aucun test, et elle porte desormais un tableau -- du balisage ou une
// en-tete mal associee rend la lecture au lecteur d ecran incomprehensible.

let root: ReactTestRoot;

beforeEach(() => {
    document.documentElement.lang = 'en';
    document.title = 'Privacy policy | Legacy 22';
    root = createReactTestRoot();
});

afterEach(async () => {
    await root.unmount();
});

describe('PrivacyPolicyPage', () => {
    it('n a aucune violation WCAG A ou AA detectable', async () => {
        await root.render(<PrivacyPolicyPage onBack={vi.fn()} />);

        const results = await axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
            // axe documente que cette regle ne donne pas de resultat fiable en jsdom.
            rules: { 'color-contrast': { enabled: false } },
        });

        expect(results.violations).toEqual([]);
    });

    it('nomme chaque sous-traitant, ou il se trouve et qui y accede', async () => {
        await root.render(<PrivacyPolicyPage onBack={vi.fn()} />);

        const tableau = getElement<HTMLTableElement>('.policy-processors');

        expect(tableau.querySelectorAll('tbody tr')).toHaveLength(PROCESSORS.length);

        for (const processor of PROCESSORS) {
            expect(tableau.textContent).toContain(processor.name);
            expect(tableau.textContent).toContain(processor.where);
        }
    });

    // Sans `scope`, un lecteur d ecran ne sait pas quelle cellule appartient a
    // quelle colonne : le tableau devient une liste de mots.
    it('associe chaque en-tete a sa colonne ou a sa ligne', async () => {
        await root.render(<PrivacyPolicyPage onBack={vi.fn()} />);

        const colonnes = [...document.querySelectorAll('.policy-processors thead th')];
        const lignes = [...document.querySelectorAll('.policy-processors tbody th')];

        expect(colonnes).toHaveLength(4);
        expect(colonnes.every(th => th.getAttribute('scope') === 'col')).toBe(true);
        expect(lignes).toHaveLength(PROCESSORS.length);
        expect(lignes.every(th => th.getAttribute('scope') === 'row')).toBe(true);
    });

    it('dit qu aucune donnee ne sort de l Union, et sous quelle juridiction', async () => {
        await root.render(<PrivacyPolicyPage onBack={vi.fn()} />);

        const texte = getElement<HTMLElement>('.policy-page').textContent ?? '';

        expect(texte).toMatch(/European Union/u);
        expect(texte).toMatch(/United States/u);
    });
});
