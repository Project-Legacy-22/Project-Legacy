import { pino } from 'pino';
import type { DestinationStream } from 'pino';
import type { Logger } from '@legacy/contracts';

// Structured JSON logging. Two rules govern what may be written, both from the
// team's code standards: identifiers are fine, content is not.
//
// The name of an item is user content and never appears in a log line. The
// redaction list below is a safety net for the fields that would carry it or a
// credential if some future middleware logged a whole request.
const REDACTED = [
    'req.body',
    'req.headers.authorization',
    'req.headers.cookie',
    'password',
    '*.password',
];

// The destination is a parameter so a test can read back what was written and
// assert that redaction actually happened. Left undefined, pino writes to
// stdout exactly as before.
export function createLogger(
    level: string = process.env.LOG_LEVEL ?? 'info',
    destination?: DestinationStream,
): Logger {
    const options = {
        level,
        redact: { paths: REDACTED, censor: '[redacted]' },
        formatters: {
            level: (label: string) => ({ level: label }),
        },
    };

    return destination === undefined ? pino(options) : pino(options, destination);
}
