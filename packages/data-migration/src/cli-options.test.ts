import { describe, expect, it } from 'vitest';

import { options, required } from './cli-options.js';

describe('options', () => {
    it('reads the pairs a command was given', () => {
        const found = options(['--from', 'legacy.sql', '--engine', 'mysql']);

        expect(found.get('from')).toBe('legacy.sql');
        expect(found.get('engine')).toBe('mysql');
    });

    it('reads no option from no argument', () => {
        expect(options([]).size).toBe(0);
    });

    // A value that looks like an option is still a value: `--project --out`
    // means a project named `--out`, which is odd but unambiguous. What is
    // refused is a word where an option name belongs.
    it('refuses a bare word where an option name belongs', () => {
        expect(() => options(['legacy.sql'])).toThrow(/is not an option/u);
    });

    it('refuses an option whose value is missing', () => {
        expect(() => options(['--from'])).toThrow(/carries no value/u);
    });
});

describe('required', () => {
    it('returns the value a command cannot do without', () => {
        expect(required(options(['--from', 'legacy.sql']), 'from')).toBe('legacy.sql');
    });

    // An empty value is as absent as no value at all: `--owner ''` must not
    // produce a script addressed to nobody.
    it.each([[[]], [['--from', '']]])('refuses a missing or empty value: %j', args => {
        expect(() => required(options(args), 'from')).toThrow(/--from is missing/u);
    });
});
