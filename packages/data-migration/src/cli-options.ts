import { exit, stderr } from 'node:process';

// Reading `--name value` pairs, and failing the same way for both commands.
//
// Written by hand rather than pulled from a package: this package declares no
// dependency, because it has to work the day the application does not. Shared
// between the two commands rather than copied, because two argument parsers
// drift and only one of them gets the fix.

export function options(args: readonly string[]): Map<string, string> {
    const found = new Map<string, string>();

    for (let at = 0; at < args.length; at += 2) {
        const name = args[at] ?? '';
        const value = args[at + 1];

        if (!name.startsWith('--')) throw new Error(`\`${name}\` is not an option`);
        if (value === undefined) throw new Error(`\`${name}\` carries no value`);

        found.set(name.slice(2), value);
    }

    return found;
}

export function required(found: Map<string, string>, name: string): string {
    const value = found.get(name);
    if (value === undefined || value === '') throw new Error(`--${name} is missing`);

    return value;
}

// What went wrong first, then how to call the command: a reader looking at a
// wall of usage text should not have to hunt for the one line that names the
// mistake.
export function fail(cause: unknown, usage: string): never {
    stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n\n${usage}\n`);
    exit(1);
}
