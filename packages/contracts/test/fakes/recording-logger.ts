import type { Logger } from '../../src/logger.js';

export interface LoggedLine {
    level: 'info' | 'warn' | 'error' | 'fatal';
    fields: object;
    message: string | undefined;
}

export interface RecordingLogger extends Logger {
    readonly lines: readonly LoggedLine[];
}

// A real logger that keeps its lines in memory instead of writing them, not a
// mock: a test can then assert on what was logged and, more importantly for
// this project, on what was not. Keeping user content out of logs is a rule the
// team committed to, so it deserves an assertion rather than a review comment.
//
// It lives with the port it implements, like the identity provider's fake, so
// every side that logs asserts against one double rather than its own copy.
export function recordingLogger(): RecordingLogger {
    const lines: LoggedLine[] = [];
    const record =
        (level: LoggedLine['level']) =>
        (fields: object, message?: string): void => {
            lines.push({ level, fields, message });
        };

    return {
        lines,
        info: record('info'),
        warn: record('warn'),
        error: record('error'),
        fatal: record('fatal'),
    };
}
