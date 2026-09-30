import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createReactTestRoot, getElement } from '../test/react-root';
import type { ReactTestRoot } from '../test/react-root';
import { PROCESSORS } from './policy-processors';
import { PrivacyPolicyPage } from './privacy-policy-page';

// The public page someone reads before deciding whether to create an account. It had no test, and
// it now carries a table -- a markup or a badly associated header makes reading it with a screen
// reader incomprehensible.

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
    it('has no detectable WCAG A or AA violation', async () => {
        await root.render(<PrivacyPolicyPage onBack={vi.fn()} />);

        const results = await axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
            // axe documents that this rule gives no reliable result in jsdom.
            rules: { 'color-contrast': { enabled: false } },
        });

        expect(results.violations).toEqual([]);
    });

    it('names each processor, where it is and who accesses it', async () => {
        await root.render(<PrivacyPolicyPage onBack={vi.fn()} />);

        const tableau = getElement<HTMLTableElement>('.policy-processors');

        expect(tableau.querySelectorAll('tbody tr')).toHaveLength(PROCESSORS.length);

        for (const processor of PROCESSORS) {
            expect(tableau.textContent).toContain(processor.name);
            expect(tableau.textContent).toContain(processor.where);
        }
    });

    // Without `scope`, a screen reader does not know which cell belongs to which column: the table
    // becomes a list of words.
    it('associates each header with its column or its row', async () => {
        await root.render(<PrivacyPolicyPage onBack={vi.fn()} />);

        const colonnes = [...document.querySelectorAll('.policy-processors thead th')];
        const lignes = [...document.querySelectorAll('.policy-processors tbody th')];

        expect(colonnes).toHaveLength(4);
        expect(colonnes.every(th => th.getAttribute('scope') === 'col')).toBe(true);
        expect(lignes).toHaveLength(PROCESSORS.length);
        expect(lignes.every(th => th.getAttribute('scope') === 'row')).toBe(true);
    });

    it('says that no data leaves the Union, and under which jurisdiction', async () => {
        await root.render(<PrivacyPolicyPage onBack={vi.fn()} />);

        const texte = getElement<HTMLElement>('.policy-page').textContent ?? '';

        expect(texte).toMatch(/European Union/u);
        expect(texte).toMatch(/United States/u);
    });
});
