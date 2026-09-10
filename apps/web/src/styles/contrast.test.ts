import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONTRAST_PAIRS, EXEMPT, FOCUS_SURFACES } from './contrast-pairs';

// No other test verifies contrast. axe knows how to compute it, but its
// color-contrast rule is disabled everywhere in the suite because jsdom does
// not render: there is neither a cascade nor a computed colour to read.
//
// This test goes around the obstacle from above. It asks the DOM for nothing:
// it reads the text of tokens.css from disk and applies the WCAG relative
// luminance formula to the declared pairs. The read goes through node:fs
// rather than a ?raw import, which Vitest does not transform, so the test
// depends on no bundler configuration. What it verifies is therefore the
// palette as written, not as composed on screen -- the opacity of a disabled
// control and hover states stay out of reach, and that is the job of the
// browser tests of EN-26.

const THRESHOLDS = { text: 4.5, ui: 3 } as const;

function tokens(css: string): ReadonlyMap<string, string> {
    // The first :root block only. A second block, one day, would be a
    // conditional redefinition to be verified separately.
    const block = /:root\s*\{([^}]*)\}/u.exec(css);
    if (block === null) throw new Error('tokens.css declares no :root block');

    // noUncheckedIndexedAccess makes every capture group optional. The pattern
    // guarantees they are there, the type system does not know it: we check
    // rather than assert it.
    const declarations = block[1] ?? '';
    const found = new Map<string, string>();
    for (const [, name, value] of declarations.matchAll(
        /(--[a-z0-9-]+)\s*:\s*(#[0-9a-f]{6})\s*;/giu,
    )) {
        if (name === undefined || value === undefined) continue;
        found.set(name.toLowerCase(), value.toLowerCase());
    }
    return found;
}

const PALETTE = tokens(readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8'));

function value(name: string): string {
    const found = PALETTE.get(name);
    // Name the missing token rather than compute on an empty value: a typo in
    // the list would otherwise produce an absurd ratio instead of a readable
    // error.
    if (found === undefined) throw new Error(`token absent from tokens.css: ${name}`);
    return found;
}

function luminance(hex: string): number {
    const channels = [1, 3, 5].map(start => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
    const [red, green, blue] = channels.map(channel =>
        channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    ) as [number, number, number];

    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function ratio(first: string, second: string): number {
    const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a) as [
        number,
        number,
    ];
    // Rounded down: 4.499 must not print as 4.50 next to a threshold of 4.5
    // and suggest the pair scrapes through.
    return Math.floor(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

describe('palette contrast', () => {
    it.each(CONTRAST_PAIRS)(
        'holds $requirement for $foreground against $background ($where)',
        ({ foreground, background, requirement }) => {
            expect(ratio(value(foreground), value(background))).toBeGreaterThanOrEqual(
                THRESHOLDS[requirement],
            );
        },
    );

    // The three tests below stop the list from going stale. Without them, a
    // colour added elsewhere or a forgotten token would go unnoticed, and the
    // specification would describe a palette that no longer exists.

    it('leaves no token outside the specification', () => {
        const described = new Set([
            ...CONTRAST_PAIRS.flatMap(({ foreground, background }) => [foreground, background]),
            ...EXEMPT.map(({ token }) => token),
            ...FOCUS_SURFACES,
            '--focus-ring',
            '--focus-halo',
        ]);

        expect([...PALETTE.keys()].filter(name => !described.has(name))).toEqual([]);
    });

    // The guard that makes this specification true rather than decorative.
    //
    // As long as the stylesheets carry their own hexadecimals, a test reading
    // only tokens.css would verify a palette nobody serves: a colour changed
    // in auth.css would go unnoticed. So we check that every colour written
    // anywhere is a value declared here.
    //
    // This holds before the migration to var(--...) as well as after: it is
    // about the values, not about how they are written.
    it('leaves no stylesheet colour outside the palette', () => {
        const known = new Set(PALETTE.values());
        const intruders: string[] = [];

        for (const file of readdirSync(import.meta.dirname)) {
            if (!file.endsWith('.css') || file === 'tokens.css') continue;

            const content = readFileSync(join(import.meta.dirname, file), 'utf8');
            for (const [colour] of content.matchAll(/#[0-9a-f]{3,8}\b/giu)) {
                if (!known.has(colour.toLowerCase())) intruders.push(`${file}: ${colour}`);
            }
        }

        expect(intruders).toEqual([]);
    });

    it('requires a written reason for every exemption', () => {
        expect(EXEMPT.filter(({ reason }) => reason.trim().length < 40)).toEqual([]);
    });

    // The focus indicator is a white ring doubled by a blue halo. Either one
    // standing out is enough: that is what makes it readable on the dark
    // header as well as on a white panel. Requiring both would fail a correct
    // design, which is the worst way to get an accessibility test wrong.
    it.each(FOCUS_SURFACES)('keeps focus visible on %s', surface => {
        const background = value(surface);
        const best = Math.max(
            ratio(value('--focus-ring'), background),
            ratio(value('--focus-halo'), background),
        );

        expect(best).toBeGreaterThanOrEqual(THRESHOLDS.ui);
        // The two rings must also stand apart from each other, or the
        // indicator reads as a single stroke and loses half of itself.
        expect(ratio(value('--focus-ring'), value('--focus-halo'))).toBeGreaterThanOrEqual(
            THRESHOLDS.ui,
        );
    });
});
