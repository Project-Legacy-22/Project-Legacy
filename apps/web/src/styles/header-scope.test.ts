import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

// The header's introduction paints light text for the dark header surface. On
// a white panel it cannot be read, and it was used there twice: the personal
// data section, fixed once and noted in personal-data.css, then the
// credentials section, where it stayed for weeks (#448). Neither jsdom nor axe
// sees it -- jsdom computes no cascade and the contrast rule is off -- so the
// class is declared under the header only, and a paragraph that borrows it
// elsewhere gets no colour from it at all.

const DIRECTORY = import.meta.dirname;
const HEADER_ONLY = /\.intro(?![\w-])/u;

describe('classes of the dark header', () => {
    it('are declared only inside the header', () => {
        const unscoped = readdirSync(DIRECTORY)
            .filter(name => name.endsWith('.css'))
            .flatMap(sheet => {
                const found: string[] = [];
                postcss.parse(readFileSync(join(DIRECTORY, sheet), 'utf8')).walkRules(rule => {
                    for (const selector of rule.selectors) {
                        if (HEADER_ONLY.test(selector) && !selector.startsWith('.site-header ')) {
                            found.push(`${sheet}: ${selector}`);
                        }
                    }
                });
                return found;
            });

        expect(unscoped).toEqual([]);
    });
});
