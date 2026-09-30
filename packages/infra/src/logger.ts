import { pino } from 'pino';
import type { DestinationStream } from 'pino';
import type { Logger } from '@legacy/contracts';

// Structured JSON logging. Two rules govern what may be written, both from the
// team's code standards: identifiers are fine, content is not.
//
// The name of an item is user content and never appears in a log line. The
// redaction list below is a safety net for the fields that would carry it or a
// credential if some future middleware logged a whole request.
//
// Every entry is a field name that exists in this codebase. A list aimed at
// fields nobody writes would read as protection without being any, so each one
// below was taken from the shape it guards: the session pair GoTrue returns,
// the recovery token of a password reset, and the address itself.
//
// The address is here because a log that accumulates addresses becomes a
// second store of personal data -- outside the register, and out of reach of
// the erasure US-13 promises. An account is named in a log by its identifier.
const REDACTED = [
    'req.body',
    'req.headers.authorization',
    'req.headers.cookie',
    'password',
    '*.password',
    // The session pair, in both spellings: the domain uses camel case, the
    // provider's payloads arrive in snake case, and a redaction list that
    // knows only one of the two lets the other through.
    'accessToken',
    '*.accessToken',
    'refreshToken',
    '*.refreshToken',
    'access_token',
    '*.access_token',
    'refresh_token',
    '*.refresh_token',
    // The single-use token a password reset sends by mail.
    'recoveryToken',
    '*.recoveryToken',
    'recovery_token',
    '*.recovery_token',
    // Anything else named a token, whatever issues it.
    'token',
    '*.token',
    'email',
    '*.email',
];

// The destination is a parameter so a test can read back what was written and
// assert that redaction actually happened. Left undefined, pino writes to
// stdout exactly as before.
//
// The level is received, never read from the environment. An adapter that
// reaches for process.env puts a second source of configuration beside the
// config module, and the two drift: the example file stops describing what the
// application actually reads. The composition root passes what config parsed.
export function createLogger(level = 'info', destination?: DestinationStream): Logger {
    const options = {
        level,
        redact: { paths: REDACTED, censor: '[redacted]' },
        formatters: {
            level: (label: string) => ({ level: label }),
        },
    };

    return destination === undefined ? pino(options) : pino(options, destination);
}
