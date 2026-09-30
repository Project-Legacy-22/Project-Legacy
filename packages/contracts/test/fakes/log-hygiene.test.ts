import { describe, expect, it } from 'vitest';

import { refusePersonalData } from './log-hygiene.js';
import { recordingLogger } from './recording-logger.js';

// A guard is judged both ways. This one refuses what it must refuse and lets
// through what is not personal data: a control that cries wolf ends up
// disarmed, and this one protects a rule that must not be.
const ACCOUNT_ID = '00000000-0000-7000-8000-000000000001';

// The base64url of a small JSON object, exactly like the pagination cursor this
// repository builds. It opens with the same three characters as a signed token,
// and is not one.
const CURSOR = Buffer.from(JSON.stringify({ position: 3, priority: 'high' }), 'utf8').toString(
    'base64url',
);

const SIGNED_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.3Ql-signature-part';

describe('refusePersonalData, what is refused', () => {
    it('refuses an address written in a field', () => {
        expect(() => refusePersonalData({ user: 'alice@example.com' }, undefined)).toThrow(
            /email address/u,
        );
    });

    // The likeliest path: nobody logs an address on purpose, it arrives in the
    // message of an error passed on as it is.
    it('refuses an address hidden in the message of an error', () => {
        const error = new Error('no account for bob@example.org');

        expect(() => refusePersonalData({ err: error }, 'unhandled failure')).toThrow(
            /email address/u,
        );
    });

    it('refuses a signed token', () => {
        expect(() => refusePersonalData({ session: SIGNED_TOKEN }, undefined)).toThrow(
            /JSON Web Token/u,
        );
    });

    // A field whose name announces a secret needs no recognisable shape: a
    // readable value is enough to condemn it.
    it('refuses a credential field written in clear, whatever its shape', () => {
        expect(() => refusePersonalData({ recoveryToken: 'short-and-opaque' }, undefined)).toThrow(
            /credential field/u,
        );
    });

    it('refuses an address deep inside a nested structure', () => {
        expect(() =>
            refusePersonalData({ request: { actor: { contact: 'carol@example.net' } } }, undefined),
        ).toThrow(/request\.actor\.contact/u);
    });
});

describe('refusePersonalData, what goes through', () => {
    it('lets identifiers through', () => {
        expect(() =>
            refusePersonalData({ accountId: ACCOUNT_ID, traceId: 'trace-1', status: 500 }, 'failed'),
        ).not.toThrow();
    });

    // The false positive this guard produced on its first run, and the reason it
    // no longer recognises a token by its first three characters.
    it('lets a pagination cursor through', () => {
        expect(() =>
            refusePersonalData({ path: `/items?limit=1&cursor=${CURSOR}` }, undefined),
        ).not.toThrow();
    });

    it('lets an already redacted field through', () => {
        expect(() => refusePersonalData({ password: '[redacted]' }, undefined)).not.toThrow();
    });
});

describe('the recording logger', () => {
    it('applies the guard to every line, without the test having to think of it', () => {
        const logger = recordingLogger();

        expect(() => logger.error({ email: 'dave@example.com' }, 'boom')).toThrow(/EN-40/u);
        expect(logger.lines).toHaveLength(0);
    });

    it('records a line carrying only identifiers as usual', () => {
        const logger = recordingLogger();

        logger.info({ accountId: ACCOUNT_ID, traceId: 'trace-2' }, 'account read');

        expect(logger.lines).toHaveLength(1);
    });
});
