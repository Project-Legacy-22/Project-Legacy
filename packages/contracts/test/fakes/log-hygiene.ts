// The control EN-40 asks for: it reads the lines the test suite produces and
// refuses the ones carrying an address or a token.
//
// It lives in the recording logger rather than in a script over the run's
// output, because that is where the lines actually are: every side that logs
// is tested against that double, and nothing this project runs writes a log to
// stdout during a test. A script scanning stdout would find nothing and pass
// for ever, which is worse than no control at all -- it would report a
// guarantee that was never checked.
//
// It fires at the call site, so the failure names the test that logged and the
// field it logged, not a line in a file nobody wrote.

// Deliberately loose. It is not validating an address, it is noticing one, and
// a pattern that missed "a.b+tag@sub.example.co.uk" would miss the leak that
// matters. An at sign followed by a dotted domain is enough, and matching only
// that keeps the search linear: a repeated local part before the at sign made
// it backtrack on long values.
const ADDRESS = /@[\w-]+\.[\w-]/u;

// The three dot-separated segments of a JSON Web Token, the second of which is
// what the session pair carries.
//
// The opening "eyJ" alone is not enough to recognise one: it is the base64url
// of the two characters that open any JSON object, so a pagination cursor --
// which this repository builds by encoding a small object the same way -- opens
// with exactly the same three characters. Matching on that prefix flagged the
// item cursor on every paginated request. A control that cries wolf gets
// ignored, and this one guards a rule that must not be.
const JSON_WEB_TOKEN = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/u;

// Field names that must never carry a readable value. The redaction list of
// packages/infra/src/logger.ts covers the real logger; this covers the fake,
// so a field added to one and forgotten in the other is caught here.
const CREDENTIAL_FIELD = /password|token|secret|authorization|cookie/iu;

const REDACTED = '[redacted]';

function offence(path: string, value: string): string | undefined {
    if (value === REDACTED) return undefined;
    if (ADDRESS.test(value)) return `${path} carries an email address`;
    if (JSON_WEB_TOKEN.test(value)) return `${path} carries a JSON Web Token`;
    return undefined;
}

// Errors are visited by hand: their message and stack are not enumerable, so an
// address inside a message -- the likeliest way one reaches a log at all --
// would otherwise pass unseen.
function inspectError(error: Error, path: string, found: string[]): void {
    inspect(error.message, `${path}.message`, found);
    inspect(error.stack ?? '', `${path}.stack`, found);
}

// A field whose name announces a secret needs no recognisable shape: a readable
// value under that name is enough to condemn it.
function inspectObject(value: object, path: string, found: string[]): void {
    for (const [name, nested] of Object.entries(value)) {
        const here = path === '' ? name : `${path}.${name}`;
        const readable = typeof nested === 'string' && nested !== REDACTED;

        if (CREDENTIAL_FIELD.test(name) && readable) {
            found.push(`${here} is a credential field written in clear`);
        } else {
            inspect(nested, here, found);
        }
    }
}

// Walks whatever was logged.
function inspect(value: unknown, path: string, found: string[]): void {
    if (typeof value === 'string') {
        const problem = offence(path, value);
        if (problem !== undefined) found.push(problem);
        return;
    }

    if (value instanceof Error) return inspectError(value, path, found);
    if (Array.isArray(value)) {
        value.forEach((item, index) => inspect(item, `${path}[${index}]`, found));
        return;
    }
    if (typeof value === 'object' && value !== null) inspectObject(value, path, found);
}

export function refusePersonalData(fields: object, message: string | undefined): void {
    const found: string[] = [];
    inspect(fields, '', found);
    if (message !== undefined) inspect(message, 'message', found);

    if (found.length > 0) {
        throw new Error(
            `This log line carries personal data, which EN-40 forbids: ${found.join('; ')}. ` +
                'Log the account identifier and the correlation identifier instead.',
        );
    }
}
