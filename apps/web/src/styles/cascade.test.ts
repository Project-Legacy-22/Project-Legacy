import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import postcss from 'postcss';
import type { AtRule, Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

// A media rule that a later rule overrides is dead code at every width.
//
// It happened (#42): `.add-form { grid-template-columns: 1fr }` was declared in
// the 620 px block of layout.css, and controls.css, imported after it, set the
// same property on the same selector outside any media query. Same
// specificity, later wins: the narrow layout never applied and the add form
// pushed the page 275 px wider than a phone. jsdom computes no layout, so no
// component test could see it; the defect is in the order of the sheets, and
// that order can be read.

const DIRECTORY = import.meta.dirname;

interface Declaration {
    key: string;
    position: number;
    where: string;
}

function importedSheets(): readonly string[] {
    const entry = readFileSync(join(DIRECTORY, '..', 'styles.css'), 'utf8');
    return [...entry.matchAll(/@import '\.\/styles\/([\w-]+\.css)';/gu)].map(match => match[1] ?? '');
}

function insideMedia(rule: Rule): boolean {
    return rule.parent?.type === 'atrule' && (rule.parent as AtRule).name === 'media';
}

// Every declaration of every sheet, in the order the browser applies them.
function declarations(): { base: Declaration[]; media: Declaration[] } {
    const base: Declaration[] = [];
    const media: Declaration[] = [];
    let position = 0;

    for (const sheet of importedSheets()) {
        postcss.parse(readFileSync(join(DIRECTORY, sheet), 'utf8')).walkRules(rule => {
            const target = insideMedia(rule) ? media : base;
            rule.walkDecls(declaration => {
                for (const selector of rule.selectors) {
                    position += 1;
                    const where = `${sheet}:${String(declaration.source?.start?.line)}`;
                    target.push({ key: `${selector} { ${declaration.prop} }`, position, where });
                }
            });
        });
    }

    return { base, media };
}

describe('the cascade of the stylesheets', () => {
    it('lets no later rule override a media rule on the same selector and property', () => {
        const { base, media } = declarations();

        const dead = media.flatMap(narrow =>
            base
                .filter(wide => wide.key === narrow.key && wide.position > narrow.position)
                .map(wide => `${narrow.key}: ${narrow.where} is overridden by ${wide.where}`),
        );

        expect(dead).toEqual([]);
    });

    it('reads every sheet the entry point imports', () => {
        // The check above passes on an empty list: make sure it read something.
        expect(importedSheets().length).toBeGreaterThan(5);
    });
});
