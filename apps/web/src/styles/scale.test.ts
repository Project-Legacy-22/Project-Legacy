import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

// Every spacing and every text size comes from the scales in tokens.css (#445).
//
// The stylesheets used to write them by hand: about twenty spacings and nine
// sizes, 14 px next to 16 px next to 18 px, with nothing to say which one a new
// rule should pick. A scale nobody enforces drifts back the first time someone
// types a pixel value, so this test reads the sheets the way contrast.test.ts
// reads the colours, through the parser vite compiles them with.
//
// Positions (top, left), borders, outlines and the focus halo are not spacing
// and stay out of scope: a 2 px border is a line weight, not a gap.

const DIRECTORY = import.meta.dirname;
const SPACING = /^(?:(?:margin|padding)(?:-[a-z-]+)?|gap|row-gap|column-gap)$/u;
// A literal length. Viewport units and percentages stay allowed: the fluid
// middle term of a clamp() is bounded by the tokens on either side of it.
const LENGTH = /(?<![\w.-])\d*\.?\d+(?:px|rem|em)\b/u;
const REFERENCE = /var\((--[a-z0-9-]+)\)/gu;

interface Use {
    where: string;
    prop: string;
    value: string;
}

function sheets(): readonly string[] {
    return readdirSync(DIRECTORY)
        .filter(name => name.endsWith('.css') && name !== 'tokens.css')
        .sort();
}

function uses(): readonly Use[] {
    return sheets().flatMap(sheet => {
        const found: Use[] = [];
        postcss.parse(readFileSync(join(DIRECTORY, sheet), 'utf8')).walkDecls(declaration => {
            if (SPACING.test(declaration.prop) || declaration.prop === 'font-size') {
                found.push({
                    where: `${sheet}:${declaration.source?.start?.line ?? '?'}`,
                    prop: declaration.prop,
                    value: declaration.value,
                });
            }
        });
        return found;
    });
}

function scaleTokens(): ReadonlySet<string> {
    const found = new Set<string>();
    postcss.parse(readFileSync(join(DIRECTORY, 'tokens.css'), 'utf8')).walkDecls(declaration => {
        if (/^--(?:space|font-size)-/u.test(declaration.prop)) found.add(declaration.prop);
    });
    return found;
}

function references(value: string): readonly string[] {
    return [...value.matchAll(REFERENCE)].map(match => match[1] ?? '');
}

function scaleOf(prop: string): string {
    return prop === 'font-size' ? '--font-size-' : '--space-';
}

describe('spacing and type scales', () => {
    it('leaves no literal length in a spacing or a text size', () => {
        const literal = uses()
            .filter(use => LENGTH.test(use.value.replace(REFERENCE, '')))
            .map(use => `${use.where} ${use.prop}: ${use.value}`);

        expect(literal).toEqual([]);
    });

    // A margin written with a text size would pass the test above and still
    // be off the scale, and a step that was renamed would resolve to nothing.
    it('takes each value from the scale of its property, at a step that exists', () => {
        const declared = scaleTokens();
        const wrong = uses().flatMap(use =>
            references(use.value)
                .filter(name => !name.startsWith(scaleOf(use.prop)) || !declared.has(name))
                .map(name => `${use.where} ${use.prop}: ${name}`),
        );

        expect(wrong).toEqual([]);
    });

    it('declares no step that no stylesheet uses', () => {
        const used = new Set(uses().flatMap(use => references(use.value)));
        const unused = [...scaleTokens()].filter(name => !used.has(name));

        expect(unused).toEqual([]);
    });
});
